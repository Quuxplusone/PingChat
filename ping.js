function Ping(name, main_channel) {
    var ping = {
        me: {
            id: null,
            name: name,
            Is: function(rhs) { return this.id == rhs.id && this.name == rhs.name; },
            Isnt: function(rhs) { return !this.Is(rhs); },
            IsUninitialized: function() { return this.name == null; }
        },
        onDebug: function(message){},
        onEntrance: function(me, message){},
        onExit: function(me, message){},
        onPublicMessage: function(me, message){},
        onHandshake: function(me, message){},
        onPrivateMessage: function(me, message){},
        start: function() {
            this._pubnub.subscribe({
                channel: this._main_channel,
                message: this._receivePublic.bind(this, this._main_channel)
            });
        },
        sendEntrance: function() {
            this._publish(this._main_channel, {
                sender: this.me,
                stageDirection: 'enter'
            });
        },
        sendExit: function() {
            this._publish(this._main_channel, {
                sender: this.me,
                stageDirection: 'exit'
            });
        },
        sendPublicMessage: function(messageText) {
            this._publish(this._main_channel, {
                sender: this.me,
                text: messageText
            });
        },
        sendPrivateMessageTo: function(recipient, messageText) {
            var secret_channel = this._secret_channels[recipient.id];
            if (typeof secret_channel !== 'string') {
                this.onDebug('Oops! In sendPrivateMessageTo, secret_channels[' + recipient.id + '] is ' + JSON.stringify(secret_channel));
                return;
            }
            this._publish(secret_channel, {
                sender: this.me,
                recipient: recipient,
                text: messageText
            });
        },
        _pubnub: PUBNUB.init({ publish_key: 'demo', subscribe_key: 'demo' }),
        _main_channel: main_channel || 'ping_1287376',
        _secret_channels: {},
        _recently_seen_messages: {},
        _publish: function(channel, message, then) {
            then = then || function(){};
            message.message_id = this._randomBits(31).toString(16);
            this.onDebug('Sending message on ' + channel + ':' + JSON.stringify(message));
            var msg = {
                channel: channel,
                message: message
            };
            msg.callback = function(result) {
                if (result[0] == 0) {
                    this.onDebug("Retrying publish due to failure condition " + JSON.stringify(result));
                    window.setTimeout(function() { this._pubnub.publish(msg); }.bind(this), 50);
                } else {
                    then();
                }
            }.bind(this);
            window.setTimeout(this._pubnub.publish.bind(this._pubnub, msg), 0);
        },
        _is_duplicate: function(channel, message) {
            var msg_id = message.message_id;
            if (msg_id in this._recently_seen_messages) {
                this.onDebug('Discarded duplicate message on ' + channel + ':' + JSON.stringify(message));
                return true;
            }
            this._recently_seen_messages[msg_id] = true;
            window.setTimeout(function(msg_id) {
                delete this._recently_seen_messages[msg_id];
            }.bind(this, msg_id), 1000);
            return false;
        },
        _receivePublic: function(channel, message) {
            if (this._is_duplicate(channel, message)) return;
            this.onDebug('Received message on ' + channel + ':' + JSON.stringify(message));
            if ('secretHandshake' in message) {
                this._receiveHandshake(message);
            } else if ('stageDirection' in message) {
                if (message.stageDirection == 'enter') {
                    this.onEntrance(this.me, message);
                    window.setTimeout(this._sendHandshake.bind(this, message.sender), 0);
                } else if (message.stageDirection == 'exit') {
                    this._disablePrivateMessaging(message.sender);
                    this.onExit(this.me, message);
                }
            } else if ('text' in message) {
                this.onPublicMessage(this.me, message);
                window.setTimeout(this._sendHandshake.bind(this, message.sender), 0);
            } else {
                this.onDebug('Received a malformed message on the public channel: ' + JSON.stringify(message));
            }
        },
        _disablePrivateMessaging: function(conspirator) {
            if (conspirator.id in this._secret_channels) {
                var secret_channel = this._secret_channels[conspirator.id];
                delete this._secret_channels[conspirator.id];
                if (typeof secret_channel === 'string') {
                    this.onDebug("Unsubscribing from channel " + secret_channel + "...");
                    this._pubnub.unsubscribe({
                        channel: secret_channel
                    });
                }
            }
        },
        _sendHandshake: function(conspirator, then) {
            then = then || function(){};
            if (conspirator.id in this._secret_channels) {
                then();
                return;
            }
            var g = 115183;
            var p = 67092953;
            var a = this._randomBits(26);
            var ga = this._modular_exponentiate(g, a, p);
            this._secret_channels[conspirator.id] = a;
            this._publish(this._main_channel, {
                sender: this.me,
                recipient: conspirator,
                secretHandshake: ga
            }, then);
        },
        _receiveHandshake: function(message) {
            if (this.me.Isnt(message.recipient)) return;
            var conspirator = message.sender;
            var then = function() {
                var g = 115183;
                var p = 67092953;
                var a = this._secret_channels[conspirator.id];
                if (typeof a !== 'number') {
                    this.onDebug('Oops! In _receiveHandshake, _secret_channels[' + conspirator.id + '] is ' + JSON.stringify(a));
                    return;
                }
                var gb = message.secretHandshake;
                var gab = this._modular_exponentiate(gb, a, p);
                var secret_channel = 'ping_PM_' + gab.toString(16);
                this._secret_channels[conspirator.id] = secret_channel;
                this.onDebug("Subscribing to channel " + secret_channel + "...");
                this._pubnub.subscribe({
                    channel: secret_channel,
                    message: this._receivePrivate.bind(this, secret_channel)
                });
                this.onHandshake(this.me, conspirator);
            }.bind(this);
            if (!(conspirator.id in this._secret_channels)) {
                this._sendHandshake(conspirator, then);
            } else {
                then();
            }
        },
        _receivePrivate: function(channel, message) {
            if (this._is_duplicate(channel, message)) return;
            this.onDebug('Received message on ' + channel + ':' + JSON.stringify(message));
            if (this.me.Isnt(message.recipient) && this.me.Isnt(message.sender)) {
                this.onDebug('Oh bother, this private message was intended for ' + JSON.stringify(message.recipient));
                return;
            }
            if ('text' in message) {
                this.onPrivateMessage(this.me, message);
            } else {
                this.onDebug('Received a malformed message on a private channel: ' + JSON.stringify(message));
            }
        },
        _modular_exponentiate: function(base, exp, modulus) {
            // Javascript can precisely represent numbers up to (1 << 53),
            // which means that the inputs to this function must satisfy
            //    base < modulus
            //    log(exp) < 53
            //    log(modulus) < 26
            //
            var result = 1;
            while (exp != 0) {
                if ((exp & 1) == 1) {
                    result = (result * base) % modulus;
                }
                base = (base * base) % modulus;
                exp >>= 1;
            }
            return result;
        },
        _randomBits: function(length) {
            // Javascript can precisely represent numbers up to (1 << 53),
            // which means that the input to this function must satisfy
            //    length < 53
            //
            var result = 0;
            while (length != 0) {
                var bits = Math.min(length, 4);
                var r = Math.floor(Math.random() * (1 << bits));
                result = (result << bits) | r;
                length -= bits;
            }
            return result;
        },
    };
    ping.me.id = ping._randomBits(31).toString(16);
    return ping;
};
