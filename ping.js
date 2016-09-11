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
                message: this._receivePublic.bind(this)
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
        _publish: function(channel, message, then) {
            var msg = {
                channel: channel,
                message: message
            };
            msg.callback = function(result) {
                if (result[0] == 0) {
                    this.onDebug("Retrying publish due to failure condition " + JSON.stringify(result));
                    window.setTimeout(function() { this._pubnub.publish(msg); }.bind(this), 50);
                } else {
                    if (then !== undefined) {
                        then();
                    }
                }
            }.bind(this);
            this._pubnub.publish(msg);
        },
        _receivePublic: function(message) {
            this.onDebug('Received normal message:' + JSON.stringify(message));
            if ('recipient' in message && this.me.Isnt(message.recipient) && this.me.Isnt(message.sender)) {
                if ('text' in message) {
                    this.onDebug('Got a private message from ' + message.sender.name + ' intended for ' + message.recipient.name + ':');
                    this.onDebug(message.text);
                }
                return;
            }
            if ('secretHandshake' in message) {
                this._receiveHandshake(message);
            } else if ('stageDirection' in message) {
                if (message.stageDirection == 'enter') {
                    this._enablePrivateMessaging(message.sender);
                    this.onEntrance(this.me, message);
                } else if (message.stageDirection == 'exit') {
                    this._disablePrivateMessaging(message.sender);
                    this.onExit(this.me, message);
                }
            } else if ('text' in message) {
                this._enablePrivateMessaging(message.sender);
                this.onPublicMessage(this.me, message);
            } else {
                this.onDebug('Received a malformed message on the main channel: ' + JSON.stringify(message));
            }
        },
        _enablePrivateMessaging: function(conspirator) {
            if (this.me.Is(conspirator)) return;
            if (!(conspirator.id in this._secret_channels)) {
                this._sendHandshake(conspirator, undefined);
                this.onHandshake(this.me, conspirator);
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
            if (conspirator.id in this._secret_channels) return;
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
                    message: this._receivePrivate.bind(this)
                });
                this._enablePrivateMessaging(conspirator);
            }.bind(this);
            if (conspirator.id in this._secret_channels) {
                then();
            } else {
                this._sendHandshake(conspirator, then);
            }
        },
        _receivePrivate: function(message) {
            this.onDebug('Received secret message:' + JSON.stringify(message));
            if (this.me.Isnt(message.recipient) && this.me.Isnt(message.sender)) {
                this.onDebug('Oh bother, this secret message was intended for ' + JSON.stringify(message.recipient));
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
