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
                has_counterspell: false,
                has_mirror: false,
                is_shielded: false,
                pending_cure_wounds: 0,
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
                var w = this._wizards[k];
                result = Math.min(result, w.hp);
            }
            return result;
        },
        _maxHPTarget: function(caster, args) {
            var target = null;
            if (args.monster) {
                // No monsters yet. TODO FIXME BUG HACK
            }
            if (args.wizard || target == null) {
                for (var k in this._wizards) {
                    var w = this._wizards[k];
                    if (w != caster && (target == null || target.hp > w.hp)) {
                        target = w;
                    }
                }
            }
            return target || caster;
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
        _resolveUntargetedSpell: function(caster, spell) {
            switch (spell.default_target) {
                case 'self':
                    return caster.name;
                case 'opponent':
                    return this._maxHPTarget(caster, {wizard: true, monster: true}).name;
                case 'wizard':
                    return this._maxHPTarget(caster, {wizard: true, monster: false}).name;
                case 'monster':
                    return this._maxHPTarget(caster, {wizard: false, monster: true}).name;
            }
            console.assert(false);
            return 'oops';
        },
        _resolveSpellOrdering: function() {
            console.log('resolveSpellOrdering');
            var spells = [];
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.left_spell_this_turn) {
                    var left_target = w.left_target || this._resolveUntargetedSpell(w, w.left_spell_this_turn);
                    spells.push({ caster: w.name, target: left_target, spell: w.left_spell_this_turn });
                }
                if (w.right_spell_this_turn) {
                    var right_target = w.right_target || this._resolveUntargetedSpell(w, w.right_spell_this_turn);
                    spells.push({ caster: w.name, target: right_target, spell: w.right_spell_this_turn });
                }
            }
            spells.sort(function(a,b) {
                var list = [
                    'counter-spell',
                    'cure light wounds',
                    'shield', 'magic mirror',
                    'stab', 'missile',

                    'summon goblin', 'summon ogre', 'summon troll', 'summon giant', 'summon elemental',
                    'remove enchantment', 'magic mirror', 'dispel magic',
                    'raise dead', 'cure heavy wounds',
                    'finger of death', 'lightning bolt', 'lightning bolt (one use)',
                    'cause light wounds', 'cause heavy wounds', 'fireball', 'fire storm', 'ice storm',
                    'amnesia', 'confusion', 'charm person', 'charm monster', 'paralysis', 'fear',
                    'anti-spell', 'protection from evil', 'resist heat', 'resist cold',
                    'disease', 'poison', 'blindness',
                    'invisibility', 'haste', 'time stop', 'delayed effect', 'permanency',
                    'surrender',
                ];
                var a_index = list.indexOf(a.spell.name);
                var b_index = list.indexOf(b.spell.name);
                return (a_index < b_index) ? -1 : (a_index == b_index) ? 0 : 1;
            });
            console.log(spells);
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
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.hp > 0 && w.pending_cure_wounds > 0) {
                    var regained = Math.min(w.pending_cure_wounds, 14 - w.hp);
                    if (regained) {
                        w.hp += regained;
                        summary += w.name + ' recovers ' + regained + ' points of damage for a total of ' + w.hp + '.\n';
                        w.was_damaged_this_turn = false;
                    }
                    w.pending_cure_wounds = 0;
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
                w.has_counterspell = false;
                w.has_mirror = false;
                w.is_shielded = false;
                w.pending_cure_wounds = 0;
                w.was_damaged_this_turn = false;
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
                var spell = this._spellList[f];
                var effect = this['_effect_' + spell.name.replace(/[^a-z]/g, '')] || this['_effect_nothinghappens'];
                this._spellList[f] = {
                    name: spell.name,
                    formula: f,
                    effect: effect.bind(this),
                    default_target: spell.target,
                };
            }
        },
        _spellList: {
            'p.':       { name: 'shield', target: 'self' },
            'p.d.w.p.': { name: 'remove enchantment', target: 'opponent' },
            'ccww':     { name: 'magic mirror', target: 'self' },
            'w.p.p.':   { name: 'counter-spell', target: 'self' },
            'w.w.s.':   { name: 'counter-spell', target: 'self' },
            'ccd.p.w.': { name: 'dispel magic', target: 'self' },
            'd.w.w.f.w.cc': { name: 'raise dead', target: 'self' },
            'd.f.w.': { name: 'cure light wounds', target: 'self' },
            'd.f.p.w.': { name: 'cure heavy wounds', target: 'self' },
            's.f.w.': { name: 'summon goblin', target: 'opponent' },
            'p.s.f.w.': { name: 'summon ogre', target: 'opponent' },
            'f.p.s.f.w.': { name: 'summon troll', target: 'opponent' },
            'w.f.p.s.f.w.': { name: 'summon giant', target: 'opponent' },
            'ccs.w.w.s.': { name: 'summon elemental', target: 'self' },
            's.d.': { name: 'missile', target: 'opponent' },
            'p.w.p.f.s.s.s.d.': { name: 'finger of death', target: 'opponent' },
            'd.f.f.d.d.': { name: 'lightning bolt', target: 'opponent' },
            'w.d.d.cc': { name: 'lightning bolt (one use)', target: 'opponent' },
            'w.f.p.': { name: 'cause light wounds', target: 'opponent' },
            'w.p.f.d.': { name: 'cause heavy wounds', target: 'opponent' },
            'f.s.s.d.d.': { name: 'fireball', target: 'opponent' },
            's.w.w.cc': { name: 'fire storm', target: 'self' },
            'w.s.s.cc': { name: 'ice storm', target: 'self' },
            'd.p.p.': { name: 'amnesia', target: 'wizard' },
            'd.s.f.': { name: 'confusion', target: 'opponent' },
            'p.s.d.f.': { name: 'charm person', target: 'other' },
            'p.s.d.d.': { name: 'charm monster', target: 'monster' },
            'f.f.f.': { name: 'paralysis', target: 'opponent' },
            's.w.d.': { name: 'fear', target: 'wizard' },
            's.p.f.': { name: 'anti-spell', target: 'wizard' },
            'w.w.p.': { name: 'protection from evil', target: 'self' },
            'w.w.f.p.': { name: 'resist heat', target: 'self' },
            's.s.f.p.': { name: 'resist cold', target: 'self' },
            'd.s.f.f.f.cc': { name: 'disease', target: 'opponent' },
            'd.w.w.f.w.d.': { name: 'poison', target: 'opponent' },
            'd.w.f.f.dd': { name: 'blindness', target: 'opponent' },
            'p.p.wwss': { name: 'invisibility', target: 'self' },
            'p.w.p.w.w.cc': { name: 'haste', target: 'self' },
            's.p.p.cc': { name: 'time stop', target: 'self' },
            'd.w.s.s.s.p.': { name: 'delayed effect', target: 'self' },
            's.p.f.p.s.d.w.': { name: 'permanency', target: 'self' },
            'pp': { name: 'surrender', target: 'self' },
            '!.': { name: 'stab', target: 'opponent' },
        },
        _effect_counterspell: function(caster, target) {
            target.has_counterspell = true;
            return caster.name + ' casts counter-spell on ' + this._himself(caster, target) + '.\n';
        },
        _effect_curelightwounds: function(caster, target) {
            if (target.has_counterspell) {
                return caster.name + ' casts cure light wounds on ' + this._himself(caster, target) + '. It has no effect.\n';
            } else {
                target.pending_cure_wounds += 1;
                return caster.name + ' casts cure light wounds on ' + this._himself(caster, target) + '.\n';
            }
        },
        _effect_shield: function(caster, target) {
            if (target.has_counterspell) {
                return caster.name + ' casts shield on ' + this._himself(caster, target) + '. It has no effect.\n';
            } else {
                target.is_shielded = true;
                return caster.name + ' casts shield on ' + this._himself(caster, target) + '.\n';
            }
        },
        _effect_magicmirror: function(caster, target) {
            if (target.has_counterspell) {
                return caster.name + ' casts magic mirror on ' + this._himself(caster, target) + '. It has no effect.\n';
            } else {
                target.has_mirror = true;
                return caster.name + ' casts magic mirror on ' + this._himself(caster, target) + '.\n';
            }
        },
        _effect_stab: function(caster, target) {
            if (target.is_shielded || target.has_counterspell) {
                return caster.name + ' stabs uselessly against ' + target.name + "'s magical shield.\n";
            } else {
                if (target.pending_cure_wounds >= 1) {
                    target.pending_cure_wounds -= 1;
                    return caster.name + ' stabs ' + this._himself(caster, target) + '. ' + target.name + ' looks unharmed.\n';
                } else {
                    target.takeDamage(1);
                    return caster.name + ' stabs ' + this._himself(caster, target) + ' for 1 point of damage.\n';
                }
            }
        },
        _effect_missile: function(caster, target) {
            if (target.has_counterspell) {
                return caster.name + ' hurls a missile at ' + this._himself(caster, target) + '. It has no effect.\n';
            } else if (target.has_mirror && target != caster) {
                if (caster.is_shielded || caster.has_counterspell) {
                    return caster.name + "'s missile reflects from " + target.name + "'s magic mirror and is absorbed by " + caster.name + "'s magical shield.\n";
                } else {
                    if (caster.pending_cure_wounds >= 1) {
                        caster.pending_cure_wounds -= 1;
                        return caster.name + "'s missile reflects from " + target.name + "'s magic mirror.\n" +
                               'The missile hits ' + caster.name + ' instead! ' + caster.name + ' looks unharmed.\n';
                    } else {
                        caster.takeDamage(1);
                        return caster.name + "'s missile reflects from " + target.name + "'s magic mirror.\n" +
                               'The missile hits ' + caster.name + ' for 1 point of damage instead!\n';
                    }
                }
            } else if (target.is_shielded) {
                return caster.name + "'s missile is absorbed by " + target.name + "'s magical shield.\n";
            } else {
                if (target.pending_cure_wounds >= 1) {
                    target.pending_cure_wounds -= 1;
                    return caster.name + ' hurls a missile at ' + this._himself(caster, target) + '. ' + target.name + ' looks unharmed.\n';
                } else {
                    target.takeDamage(1);
                    return caster.name + ' hurls a missile at ' + this._himself(caster, target) + ' for 1 point of damage.\n';
                }
            }
        },
        _effect_nothinghappens: function(caster, target) {
            return 'Nothing happens. At least, nothing obvious happens.\n';
        },
        _himself: function(caster, target) {
            if (caster == target) {
                return 'himself';
            }
            return target.name;
        },
    };
    waving_hands._initSpellList();
    return waving_hands;
}
