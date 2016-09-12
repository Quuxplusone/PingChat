function WavingHands() {
    var waving_hands = {
        turnNumber: 1,
        start: function() {
            this.turnNumber = 1;
        },
        numberOfWizards: function() {
            return Object.keys(this._wizards).length;
        },
        addWizard: function(name) {
            if (name in this._wizards) {
                return false;  // there's already a wizard by that name in the arena
            }
            if (this.turnNumber != 1 && this._wizards.length <= 2) {
                return false;  // only two wizards left; this arena is closed to newcomers
            }
            this._wizards[name] = {
                name: name,
                hp: this._minHP(14),
                left_history: ('X' + Array(this.turnNumber).join('_')).split(''),  // the most recent gesture is left_history[0]
                right_history: ('X' + Array(this.turnNumber).join('_')).split(''),
                left_target: null,
                right_target: null,
                is_shielded: false,
                was_damaged_this_turn: false,
                takeDamage: function(dmg) { this.hp -= dmg; this.was_damaged_this_turn = true; },
            };
            return true;
        },
        readyToResolve: function() {
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.left_history[0] == 'X') return false;
                if (w.right_history[0] == 'X') return false;
            }
            return true;
        },
        resolveTurn: function() {
            console.log('resolveTurn ' + this.turnNumber);
            var summary = '';
            this._resolveInvalidOrders();
            this._resolveCurrentSpells();
            this._resolveSpellOrdering();
            summary += this._describeGestures();
            summary += this._resolveSpellEffects();
            summary += this._describeAftermath();
            this._resetAtEndOfTurn();
            this.turnNumber += 1;
            for (var k in this._wizards) {
                var w = this._wizards[k];
                w.left_history.unshift('X');
                w.right_history.unshift('X');
                console.assert(w.left_history.length === this.turnNumber);
                console.assert(w.right_history.length === this.turnNumber);
            }
            return summary;
        },
        setLeftAction: function(name, action) {
            console.log('setLeftAction ' + name + ' ' + action);
            if (!action.match('^[fpwsdc!_]$')) return;
            this._wizards[name].left_history[0] = action;
        },
        setRightAction: function(name, action) {
            console.log('setRightAction ' + name + ' ' + action);
            if (!action.match('^[fpwsdc!_]$')) return;
            this._wizards[name].right_history[0] = action;
        },
        setLeftTarget: function(name, targetname) {
            console.log('setLeftTarget ' + name + ' ' + targetname);
            this._wizards[name].left_target = targetname;
        },
        setRightTarget: function(name, targetname) {
            console.log('setRightTarget ' + name + ' ' + targetname);
            this._wizards[name].right_target = targetname;
        },

        _wizards: {},
        _minHP: function(default_value) {
            var result = default_value;
            for (var k in this._wizards) {
                result = Math.min(result, this._wizards[k].hp);
            }
            return result;
        },
        _resolveInvalidOrders: function() {
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.left_history[0] == 'X') {
                    w.left_history[0] = '_';  // you snooze, you lose
                }
                if (w.right_history[0] == 'X') {
                    w.right_history[0] = '_';  // you snooze, you lose
                }
                if (
                    (w.left_history[0] == 'c' && w.right_history[0] != 'c') ||
                    (w.left_history[0] != 'c' && w.right_history[0] == 'c') ||
                    (w.left_history[0] == '!' && w.right_history[0] == '!')) {
                    w.left_history[0] = w.right_history[0] = '_';  // no double stabs, no Zen
                }
            }
        },
        _interleave: function(a, b) {
            var result = "";
            console.assert(a.length == b.length);
            for (var i=0; i < a.length; ++i) {
                result += a[i] + b[i];
            }
            return result;
        },
        _resolveCurrentSpells: function() {
            console.log('resolveCurrentSpells');
            for (var k in this._wizards) {
                var w = this._wizards[k];
                w.left_spell_this_turn = null;
                w.right_spell_this_turn = null;
                var bh = this._interleave(w.left_history, w.right_history);
                if (bh.startsWith('pp')) {
                    // Surrender always takes precedence over shield.
                    w.left_spell_this_turn = this._spellList['pp'];
                } else {
                    for (var f in this._spellList) {
                        var spell = this._spellList[f];
                        var lregex = this._getLeftSpellRegex(spell.formula);
                        var rregex = this._getRightSpellRegex(spell.formula);
                        if (bh.search(lregex) == 0) {
                            if (w.left_spell_this_turn && w.left_spell_this_turn.formula.endsWith(spell.formula)) {
                                // Do nothing; assume the wizard wants to cast the longer spell. TODO FIXME BUG HACK
                            } else {
                                w.left_spell_this_turn = spell;
                            }
                        }
                        if (lregex == rregex) {
                            // Some spells are bilaterally symmetric.
                            console.assert(spell.name == 'magic mirror' || spell.name == 'surrender');
                        } else {
                            if (bh.search(rregex) == 0) {
                                if (w.right_spell_this_turn && w.right_spell_this_turn.formula.endsWith(spell.formula)) {
                                    // Do nothing; assume the wizard wants to cast the longer spell. TODO FIXME BUG HACK
                                } else {
                                    w.right_spell_this_turn = spell;
                                }
                            }
                        }
                    }
                }
            }
        },
        _resolveSpellOrdering: function() {
            console.log('resolveSpellOrdering');
            var spells = [];
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.left_spell_this_turn) {
                    var left_target = w.left_spell_this_turn.target(w.name, w.left_target);
                    spells.push({ caster: w.name, target: left_target, spell: w.left_spell_this_turn });
                }
                if (w.right_spell_this_turn) {
                    var right_target = w.right_spell_this_turn.target(w.name, w.right_target);
                    spells.push({ caster: w.name, target: right_target, spell: w.right_spell_this_turn });
                }
            }
            spells.sort(function(a,b) {
                var list = [
                    'shield',
                    'stab',

                    'summon goblin', 'summon ogre', 'summon troll', 'summon giant', 'summon elemental',
                    'remove enchantment', 'magic mirror', 'counter-spell', 'dispel magic',
                    'raise dead', 'cure light wounds', 'cure heavy wounds',
                    'missile', 'finger of death', 'lightning bolt', 'lightning bolt (one use)',
                    'cause light wounds', 'cause heavy wounds', 'fireball', 'fire storm', 'ice storm',
                    'amnesia', 'confusion', 'charm person', 'charm monster', 'paralysis', 'fear',
                    'anti-spell', 'protection from evil', 'resist heat', 'resist cold',
                    'disease', 'poison', 'blindness',
                    'invisibility', 'haste', 'time stop', 'delayed effect', 'permanency',
                    'surrender',
                ];
                var a_index = list.indexOf(a.name);
                var b_index = list.indexOf(b.name);
                return (a_index < b_index) ? -1 : (a_index == b_index) ? 0 : 1;
            });
            this._spellsThisTurn = spells;
        },
        _describeGestures: function() {
            var summary = '';
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.left_history[0] == w.right_history[0]) {
                    switch (w.left_history[0]) {
                        case 'c': summary += w.name + ' claps his hands.\n'; break;
                        case 'f': summary += w.name + ' wiggles the fingers of both hands.\n'; break;
                        case 'p': summary += w.name + ' proffers both palms in surrender.\n'; break;
                        case 's': summary += w.name + ' snaps the fingers of both hands.\n'; break;
                        case 'w': summary += w.name + ' waves both his hands.\n'; break;
                        case 'd': summary += w.name + ' points with both index fingers.\n'; break;
                    }
                } else if (w.left_history[0] != '_' && w.right_history[0] != '_') {
                    summary += w.name + ' ' + this._describeGesture(w.left_history[0], 'left') + ' and ' + this._describeGesture(w.right_history[0], 'right') + '.\n';
                } else if (w.left_history[0] != '_') {
                    summary += w.name + ' ' + this._describeGesture(w.left_history[0], 'left') + '.\n';
                } else if (w.right_history[0] != '_') {
                    summary += w.name + ' ' + this._describeGesture(w.right_history[0], 'right') + '.\n';
                }
            }
            console.log('describeGestures ' + summary);
            return summary;
        },
        _describeGesture: function(action, hand) {
            switch (action) {
                case '!': return 'stabs with his ' + hand + ' hand';
                case 'f': return 'wiggles the fingers of his ' + hand + ' hand';
                case 'p': return 'proffers the palm of his ' + hand + ' hand';
                case 's': return 'snaps the fingers of his ' + hand + ' hand';
                case 'w': return 'waves his ' + hand + ' hand';
                case 'd': return 'points his ' + hand + ' index finger';
            }
            return 'oops';
        },
        _resolveSpellEffects: function() {
            console.log('resolveSpellEffects ' + JSON.stringify(this._spellsThisTurn));
            var summary = '';
            for (var i=0; i < this._spellsThisTurn.length; ++i) {
                var s = this._spellsThisTurn[i];
                var caster = this._wizards[s.caster];
                console.assert(caster);
                var target = this._wizards[s.target];
                if (target) {
                    summary += s.spell.effect(caster, target);
                } else {
                    summary += s.caster + ' casts ' + s.spell.name + ' at nothing in particular.\n';
                }
            }
            return summary;
        },
        _describeAftermath: function() {
            var summary = '';
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.was_damaged_this_turn) {
                    if (w.hp <= 0) {
                        summary += w.name + ' has perished in combat!\n';
                    } else {
                        summary += w.name + ' has ' + w.hp + ' points of damage remaining.\n'
                    }
                }
            }
            return summary;
        },
        _resetAtEndOfTurn: function() {
            for (var k in this._wizards) {
                var w = this._wizards[k];
                w.was_damaged_this_turn = false;
                w.is_shielded = false;
            }
        },
        _getLeftSpellRegex: function(lspell) {
            // Given a left-handed spell formula, return a regex that will match an interleaved history
            // ending with that spell on the left hand. E.g., given "w.w.s.", return "^s.w.w..*$".
            // For user-friendliness we allow missed turns, i.e. the regex actually returned
            // for "w.w.s." is "^s.(__)*w.(__)*w..*$". This is AGAINST the official rules of Waving Hands!
            var allow_missed_turns = function(s) { return s.match(/(..)/g).join('(__)*'); }
            var rev = function(s) { return s.split('').reverse().join(''); };
            return '^' + allow_missed_turns(rev(lspell)) + '.*$';
        },
        _getRightSpellRegex: function(lspell) {
            // Given a left-handed spell formula, return a regex that will match an interleaved history
            // ending with that spell on the right hand.
            var allow_missed_turns = function(s) { return s.match(/(..)/g).join('(__)*'); }
            var rev = function(s) { return s.split('').reverse().join(''); };
            var rspell = lspell.match(/(..)/g).map(rev).join('');
            return '^' + allow_missed_turns(rev(rspell)) + '.*$';
        },
        _initSpellList: function() {
            for (var f in this._spellList) {
                var name = this._spellList[f];
                console.assert(typeof name === 'string');
                var effect = this['_effect_' + name.replace(/[^a-z]/g, '')] || this['_effect_nothinghappens'];
                this._spellList[f] = {
                    name: name,
                    formula: f,
                    effect: effect.bind(this),
                    target: function(caster, target) { return target || caster; },  // TODO FIXME BUG HACK
                };
            }
        },
        _effect_shield: function(caster, target) {
            target.is_shielded = true;
            return caster + ' casts shield on ' + target.name + '.\n';
        },
        _effect_stab: function(caster, target) {
            if (target.is_shielded) {
                return caster.name + ' stabs uselessly against ' + target.name + "'s magical shield.\n";
            } else {
                target.takeDamage(1);
                return caster.name + ' stabs ' + target.name + ' for 1 point of damage.\n';
            }
        },
        _effect_nothinghappens: function(caster, target) {
            return 'Nothing happens. At least, nothing obvious happens.\n';
        },
        _spellList: {
            'p.': 'shield',
            'p.d.w.p.': 'remove enchantment',
            'ccww': 'magic mirror',
            'w.p.p.': 'counter-spell',
            'w.w.s.': 'counter-spell',
            'ccd.p.w.': 'dispel magic',
            'd.w.w.f.w.cc': 'raise dead',
            'd.f.w.': 'cure light wounds',
            'd.f.p.w.': 'cure heavy wounds',
            's.f.w.': 'summon goblin',
            'p.s.f.w.': 'summon ogre',
            'f.p.s.f.w.': 'summon troll',
            'w.f.p.s.f.w.': 'summon giant',
            'ccs.w.w.s.': 'summon elemental',
            's.d.': 'missile',
            'p.w.p.f.s.s.s.d.': 'finger of death',
            'd.f.f.d.d.': 'lightning bolt',
            'w.d.d.cc': 'lightning bolt (one use)',
            'w.f.p.': 'cause light wounds',
            'w.p.f.d.': 'cause heavy wounds',
            'f.s.s.d.d.': 'fireball',
            's.w.w.cc': 'fire storm',
            'w.s.s.cc': 'ice storm',
            'd.p.p.': 'amnesia',
            'd.s.f.': 'confusion',
            'p.s.d.f.': 'charm person',
            'p.s.d.d.': 'charm monster',
            'f.f.f.': 'paralysis',
            's.w.d.': 'fear',
            's.p.f.': 'anti-spell',
            'w.w.p.': 'protection from evil',
            'w.w.f.p.': 'resist heat',
            's.s.f.p.': 'resist cold',
            'd.s.f.f.f.cc': 'disease',
            'd.w.w.f.w.d.': 'poison',
            'd.w.f.f.dd': 'blindness',
            'p.p.wwss': 'invisibility',
            'p.w.p.w.w.cc': 'haste',
            's.p.p.cc': 'time stop',
            'd.w.s.s.s.p.': 'delayed effect',
            's.p.f.p.s.d.w.': 'permanency',
            'pp': 'surrender',
            '!.': 'stab',
        },
    };
    waving_hands._initSpellList();
    return waving_hands;
}
