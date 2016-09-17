function WavingHands() {
    var waving_hands = {
        turnNumber: 1,
        _newGame: function() {
            this.turnNumber = 1;
            this.game_over = false;
            this._wizards = {};
        },
        numberOfWizards: function() {
            var count = 0;
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.species == 'wizard') {
                    count += 1;
                }
            }
            return count;
        },
        addWizard: function(name) {
            if (name in this._wizards) {
                return false;  // there's already a wizard by that name in the arena
            }
            if (this.turnNumber != 1 && this.numberOfWizards() <= 2) {
                return false;  // only two wizards left; this arena is closed to newcomers
            }
            this._wizards[name] = {
                name: name,
                species: 'wizard',
                hp: this._minHP(14),
                left_history: Array(this.turnNumber + 1).join('X').split(''),  // the most recent gesture is left_history[0]
                right_history: Array(this.turnNumber + 1).join('X').split(''),
                left_targetname: null,
                right_targetname: null,
                has_counterspell: false,
                has_mirror: false,
                has_surrendered: false,
                has_used_lightning_bolt: false,
                is_shielded: 0,
                is_surrendering: false,
                pending_cure_wounds: 0,
                was_damaged_this_turn: false,
                takeDamage: function(dmg) { this.hp -= dmg; this.was_damaged_this_turn = true; },
                isStillFighting: function() { return this.hp > 0 && !this.has_surrendered; },
            };
            return true;
        },
        _HPperMonster: function(species) {
            switch (species) {
                case 'goblin': return 1;
                case 'ogre': return 2;
                case 'troll': return 3;
                case 'giant': return 4;
                case 'elemental': return 3;
            }
            return null;
        },
        _summonMonsterControlledBy: function(controller, species) {
            while (controller.species != 'wizard') {
                controller = controller.controller;
            }
            var names = [
                'Addu', 'Amurru', 'Anshar', 'Dagon', 'Eshmun', 'Rammon', 'Rashnu', 'Shamash', 'Utu', 'Zababa', 'Zurvan',
                'Agassou', 'Acongo', 'Amma', 'Famien', 'Gunab', 'Guruhi', 'Heviosso', 'Kalumba', 'Kokola', 'Kyala',
                'Mungo', 'Nampa', 'Ogun', 'Ruwa', 'Shango', 'Waka', 'Balor', 'Belenous', 'Lir', 'Midir', 'Apophis',
                'Auf', 'Hapi', 'Khepera', 'Maahes', 'Menthu', 'Shai', 'Shu', 'Ahto', 'Jumala', 'Naaki', 'Bossu',
                'Dambala', 'Petro', 'Andvari', 'Bragi', 'Donar', 'Njord',
            ];
            var name = names[0];
            for (var i=0; i < names.length; ++i) {
                name = names[i];
                if (name in this._wizards) {
                    continue;
                } else {
                    break;
                }
            }
            this._wizards[name] = {
                name: name,
                species: species,
                controller: controller,
                hp: this._HPperMonster(species),
                targetname: null,
                has_counterspell: false,
                has_mirror: false,
                is_shielded: 0,
                pending_cure_wounds: 0,
                takeDamage: function(dmg) { this.hp -= dmg; this.was_damaged_this_turn = true; },
                isStillFighting: function() { return this.hp > 0; },
            };
            return name;
        },
        setLeftGesture: function(name, gesture) {
            if (!gesture.match('^[fpwsdc!_]$')) return;
            var w = this._wizards[name];
            if (w == null || w.species != 'wizard' || !w.isStillFighting()) return;
            w.left_history[0] = gesture;
        },
        setRightGesture: function(name, gesture) {
            if (!gesture.match('^[fpwsdc!_]$')) return;
            var w = this._wizards[name];
            if (w == null || w.species != 'wizard' || !w.isStillFighting()) return;
            w.right_history[0] = gesture;
        },
        readyToResolveGestures: function() {
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.species != 'wizard' || !w.isStillFighting()) continue;
                if (w.left_history[0] == 'X') return false;
                if (w.right_history[0] == 'X') return false;
            }
            return true;
        },
        resolveGestures: function() {
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.species != 'wizard' || !w.isStillFighting()) continue;
                this._resolveInvalidOrders(w);
                this._resolveCurrentSpells(w);  // calls this.onPossibleSpells()
            }
        },
        onPossibleSpells: function(name, possibilities, callback) {
            console.assert(possibilities.length >= 1);
            callback(0);
        },
        readyToResolveSpellEffects: function() {
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.species == 'wizard' && w.isStillFighting() && !w.has_chosen_spells_this_turn) {
                    console.log('readyToResolveSpellEffects false');
                    return false;
                }
            }
            console.log('readyToResolveSpellEffects true');
            return true;
        },
        resolveSpellEffects: function() {
            var summary = '';
            this._resolveSpellOrdering();
            summary += this._describeGestures();
            summary += this._resolveSpellEffects();
            summary += this._describeAftermath();
            this._resetAtEndOfTurn();
            summary += this._checkForVictory();
            if (!this.game_over) {
                this.turnNumber += 1;
                for (var k in this._wizards) {
                    var w = this._wizards[k];
                    if (w.species != 'wizard') continue;
                    w.left_history.unshift('X');
                    w.right_history.unshift('X');
                    console.assert(w.left_history.length === this.turnNumber);
                    console.assert(w.right_history.length === this.turnNumber);
                }
            } else {
                this._newGame();
            }
            return summary;
        },

        _minHP: function(default_value) {
            var result = default_value;
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.species != 'wizard') continue;
                result = Math.min(result, w.hp);
            }
            return result;
        },
        _sameTeam: function(caster, target) {
            while (caster.species != 'wizard') {
                caster = caster.controller;
            }
            while (target.species != 'wizard') {
                target = target.controller;
            }
            return (caster == target);
        },
        _maxHPTarget: function(caster, args) {
            var target = null;
            var monster = args.monster || false;
            var wizard = args.wizard || false;
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if ((wizard && w.species == 'wizard') || (monster && w.species != 'wizard')) {
                    if (w.isStillFighting() && !this._sameTeam(w, caster)) {
                        if (target == null || target.hp > w.hp) {
                            target = w;
                        }
                    }
                }
            }
            return target || caster;
        },
        _resolveInvalidOrders: function(w) {
            if (w.left_history[0] == 'X' && w.right_history[0] != 'X') {
                w.left_history[0] = '_';  // you snooze, you lose
            }
            if (w.right_history[0] == 'X' && w.left_history[0] != 'X') {
                w.right_history[0] = '_';  // you snooze, you lose
            }
            if (
                (w.left_history[0] == 'c' && w.right_history[0] != 'c') ||
                (w.left_history[0] != 'c' && w.right_history[0] == 'c') ||
                (w.left_history[0] == '!' && w.right_history[0] == '!')) {
                w.left_history[0] = w.right_history[0] = '_';  // no double stabs, no Zen
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
        _spellsAreCompatible: function(lspell, rspell) {
            var rev = function(s) { return s.split('').reverse().join(''); };
            var lf = rev(lspell.formula);
            var rf = rev(rspell.formula.match(/(..)/g).map(rev).join(''));
            for (var i=0; i < Math.min(lf.length, rf.length); ++i) {
                if (lf[i] != '.' && rf[i] != '.') {
                    return false;
                }
            }
            return true;
        },
        _resolveCurrentSpells: function(w) {
            // Enumerate all possible spell combinations (for each wizard individually),
            // and then delegate back to our caller via onPossibleSpells() in case
            // the caller needs to choose one of those options. Always delegate, even
            // if there are zero possibilities or one possibility, just in case the
            // caller is depending on this behavior.
            var bh = this._interleave(w.left_history, w.right_history);
            if (bh.startsWith('pp')) {
                w.is_surrendering = true;
                // Surrendering is not incompatible with casting spells
                // (most obviously, shield; but maybe something more complex).
            }
            var left_possibilities = [];
            var right_possibilities = [];
            for (var f in this._spellList) {
                var spell = this._spellList[f];
                var lregex = this._getLeftSpellRegex(spell.formula);
                var rregex = this._getRightSpellRegex(spell.formula);
                if (bh.search(lregex) == 0) {
                    // This is a possibility with the left hand.
                    left_possibilities.push(spell);
                }
                if (bh.search(rregex) == 0) {
                    // This is a possibility with the left hand.
                    right_possibilities.push(spell);
                }
            }
            var both_possibilities = [];
            var found_possible_accompaniment = {};
            for (var li=0; li < left_possibilities.length; ++li) {
                for (var ri=0; ri < right_possibilities.length; ++ri) {
                    var lspell = left_possibilities[li];
                    var rspell = right_possibilities[ri];
                    if (this._spellsAreCompatible(lspell, rspell)) {
                        both_possibilities.push({ left: lspell, right: rspell, text: 'cast ' + lspell.name + ' with your left hand and ' + rspell.name + ' with your right hand' });
                        found_possible_accompaniment['L' + lspell.formula] = true;
                        found_possible_accompaniment['R' + rspell.formula] = true;
                    }
                }
            }
            for (var li=0; li < left_possibilities.length; ++li) {
                var lspell = left_possibilities[li];
                if (!found_possible_accompaniment['L' + lspell.formula]) {
                    both_possibilities.push({ left: lspell, right: null, text: 'cast ' + lspell.name + ' with your left hand' });
                }
            }
            for (var ri=0; ri < right_possibilities.length; ++ri) {
                var rspell = right_possibilities[ri];
                if (!found_possible_accompaniment['R' + rspell.formula]) {
                    both_possibilities.push({ left: null, right: rspell, text: 'cast ' + rspell.name + ' with your right hand' });
                }
            }
            if (both_possibilities.length == 0) {
                both_possibilities.push({ left: null, right: null, text: 'cast no spells this turn' });
            }
            var callback = function(turn, w, both_possibilities, index) {
                console.log('callback', w, both_possibilities, turn, index);
                if (turn != this.turnNumber || w.has_chosen_spells_this_turn) {
                    return;  // no effect if you miss the boat
                }
                w.left_spell_this_turn = both_possibilities[index].left;
                w.right_spell_this_turn = both_possibilities[index].right;
                w.has_chosen_spells_this_turn = true;
            }.bind(this, this.turnNumber, w, both_possibilities);
            this.onPossibleSpells(w.name, both_possibilities, callback);
        },
        _resolveUntargetedSpell: function(caster, spell) {
            switch (spell.default_target) {
                case 'self':
                    return caster;
                case 'opponent':
                    return this._maxHPTarget(caster, {wizard: true, monster: true});
                case 'wizard':
                    return this._maxHPTarget(caster, {wizard: true, monster: false});
                case 'monster':
                    return this._maxHPTarget(caster, {wizard: false, monster: true});
            }
            console.assert(false);
            return 'oops';
        },
        _resolveTarget: function(targetname) {
            return null;  // TODO FIXME BUG HACK: how does one name a target who might not even exist yet?
        },
        _resolveSpellOrdering: function() {
            console.log('resolveSpellOrdering');
            var spells = [];
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.species == 'wizard') {
                    if (w.left_spell_this_turn) {
                        var left_target = this._resolveTarget(w.left_targetname) || this._resolveUntargetedSpell(w, w.left_spell_this_turn);
                        spells.push({ caster: w, target: left_target, spell: w.left_spell_this_turn });
                    }
                    if (w.right_spell_this_turn) {
                        var right_target = this._resolveTarget(w.right_targetname) || this._resolveUntargetedSpell(w, w.right_spell_this_turn);
                        spells.push({ caster: w, target: right_target, spell: w.right_spell_this_turn });
                    }
                } else {
                    var spell = { name: 'monster_attack', default_target: 'opponent', effect: this._effect_monster_attack.bind(this) };
                    var target = this._resolveTarget(w.targetname) || this._resolveUntargetedSpell(w, spell);
                    spells.push({ caster: w, target: target, spell: spell });
                }
            }
            spells.sort(function(a,b) {
                var list = [
                    'counter-spell',
                    'cure light wounds',
                    'protection from evil', 'shield', 'magic mirror',
                    'summon goblin', 'summon ogre', 'summon troll', 'summon giant',
                    'monster_attack', 'stab', 'missile', 'lightning bolt', 'lightning bolt (one use)',

                    'summon elemental',
                    'remove enchantment', 'magic mirror', 'dispel magic',
                    'raise dead', 'cure heavy wounds',
                    'finger of death',
                    'cause light wounds', 'cause heavy wounds', 'fireball', 'fire storm', 'ice storm',
                    'amnesia', 'confusion', 'charm person', 'charm monster', 'paralysis', 'fear',
                    'anti-spell', 'resist heat', 'resist cold',
                    'disease', 'poison', 'blindness',
                    'invisibility', 'haste', 'time stop', 'delayed effect', 'permanency',
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
                if (w.species != 'wizard') continue;
                if (w.left_history[0] == w.right_history[0]) {
                    switch (w.left_history[0]) {
                        case 'c': summary += w.name + ' claps his hands.\n'; break;
                        case 'f': summary += w.name + ' wiggles the fingers of both hands.\n'; break;
                        case 'p': summary += w.name + ' proffers both palms in surrender.\n'; break;
                        case 's': summary += w.name + ' snaps the fingers of both hands.\n'; break;
                        case 'w': summary += w.name + ' waves both his hands.\n'; break;
                        case 'd': summary += w.name + ' points with both index fingers.\n'; break;
                    }
                } else if (w.left_history[0].match('^[fpwsdc!]$') && w.right_history[0].match('^[fpwsdc!]$')) {
                    summary += w.name + ' ' + this._describeGesture(w.left_history[0], 'left') + ' and ' + this._describeGesture(w.right_history[0], 'right') + '.\n';
                } else if (w.left_history[0].match('^[fpwsdc!]$')) {
                    summary += w.name + ' ' + this._describeGesture(w.left_history[0], 'left') + '.\n';
                } else if (w.right_history[0].match('^[fpwsdc!]$')) {
                    summary += w.name + ' ' + this._describeGesture(w.right_history[0], 'right') + '.\n';
                }
            }
            console.log('describeGestures ' + summary);
            return summary;
        },
        _describeGesture: function(gesture, hand) {
            switch (gesture) {
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
            var summary = '';
            for (var i=0; i < this._spellsThisTurn.length; ++i) {
                var s = this._spellsThisTurn[i];
                if (s.target) {
                    summary += s.spell.effect(s.caster, s.target);
                } else {
                    summary += s.caster + ' casts ' + s.spell.name + ' at nothing in particular.\n';
                }
            }
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.isStillFighting() && w.pending_cure_wounds > 0) {
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
                if (w.was_damaged_this_turn && !w.has_surrendered) {
                    if (w.hp <= 0) {
                        summary += w.name + ' has ' + (w.species == 'wizard' ? 'perished in combat' : 'been killed') + '!\n';
                    } else {
                        summary += w.name + ' has ' + this._points(w.hp) + ' of damage remaining.\n'
                    }
                }
            }
            return summary;
        },
        _resetAtEndOfTurn: function() {
            for (var k in this._wizards) {
                var w = this._wizards[k];
                w.has_chosen_spells_this_turn = false;
                w.has_counterspell = false;
                w.has_mirror = false;
                w.has_surrendered = w.has_surrendered || w.is_surrendering;
                w.is_shielded = Math.max(0, w.is_shielded - 1);
                w.is_surrendering = false;
                w.pending_cure_wounds = 0;
                w.was_damaged_this_turn = false;
            }
        },
        _checkForVictory: function() {
            var remaining_wizards = [];
            for (var k in this._wizards) {
                var w = this._wizards[k];
                if (w.species == 'wizard' && w.isStillFighting()) {
                    remaining_wizards.push(w);
                }
            }
            if (remaining_wizards.length == 0) {
                this.game_over = true;
                return 'The battle has ended in mutual defeat.\n';
            } else if (remaining_wizards.length == 1) {
                this.game_over = true;
                return 'The battle has ended and ' + remaining_wizards[0].name + ' is victorious!\n';
            }
            return '';
        },
        _getLeftSpellRegex: function(lspell) {
            // Given a left-handed spell formula, return a regex that will match an interleaved history
            // ending with that spell on the left hand. E.g., given "w.w.s.", return "^s.w.w..*$".
            // For user-friendliness we allow missed turns, i.e. the regex actually returned
            // for "w.w.s." is "^s.(XX)*w.(XX)*w..*$". This is AGAINST the official rules of Waving Hands!
            var allow_missed_turns = function(s) { return s.match(/(..)/g).join('(XX)*'); }
            var rev = function(s) { return s.split('').reverse().join(''); };
            return '^' + allow_missed_turns(rev(lspell)) + '.*$';
        },
        _getRightSpellRegex: function(lspell) {
            // Given a left-handed spell formula, return a regex that will match an interleaved history
            // ending with that spell on the right hand.
            var allow_missed_turns = function(s) { return s.match(/(..)/g).join('(XX)*'); }
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
            's.f.w.': { name: 'summon goblin', target: 'self' },
            'p.s.f.w.': { name: 'summon ogre', target: 'self' },
            'f.p.s.f.w.': { name: 'summon troll', target: 'self' },
            'w.f.p.s.f.w.': { name: 'summon giant', target: 'self' },
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
        _effect_protectionfromevil: function(caster, target) {
            if (target.has_counterspell) {
                return caster.name + ' casts protection from evil on ' + this._himself(caster, target) + '. It has no effect.\n';
            } else {
                target.is_shielded = Math.max(target.is_shielded, 4);
                return caster.name + ' casts protection from evil on ' + this._himself(caster, target) + '.\n';
            }
        },
        _effect_shield: function(caster, target) {
            if (target.has_counterspell) {
                return caster.name + ' casts shield on ' + this._himself(caster, target) + '. It has no effect.\n';
            } else {
                target.is_shielded = Math.max(target.is_shielded, 1);
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
        _effect_summonmonster: function(caster, target, species) {
            if (target.has_counterspell) {
                return caster.name + ' casts summon ' + species + ' at ' + this._himself(caster, target) + '. It has no effect.\n';
            } else if (target.has_mirror && target != caster) {
                if (caster.has_mirror) {
                    return 'For a brief moment, ' + caster.name + "'s summon " + species + ' spell reflects infinitely between ' + target.name + "'s magic mirror and his own; then it attenuates to nothing.\n";
                } else if (caster.has_counterspell) {
                    return caster.name + "'s summon " + species + ' spell reflects from ' + target.name + "'s magic mirror back toward " + caster.name + '. It has no effect.\n';
                } else {
                    var monsterName = this._summonMonsterControlledBy(target, species);
                    return caster.name + "'s summon " + species + ' spell reflects from ' + target.name + "'s magic mirror.\n" +
                        'A ' + species + ' named ' + monsterName + ' appears in the arena!\n';
                }
            } else {
                var monsterName = this._summonMonsterControlledBy(target, species);
                return caster.name + ' casts summon ' + species + ' at ' + this._himself(caster, target) + '.\n' +
                    'A ' + species + ' named ' + monsterName + ' appears in the arena!\n';
            }
        },
        _effect_summongoblin: function(caster, target) {
            return this._effect_summonmonster(caster, target, 'goblin');
        },
        _effect_summonogre: function(caster, target) {
            return this._effect_summonmonster(caster, target, 'ogre');
        },
        _effect_summontroll: function(caster, target) {
            return this._effect_summonmonster(caster, target, 'troll');
        },
        _effect_summongiant: function(caster, target) {
            return this._effect_summonmonster(caster, target, 'giant');
        },
        _effect_monster_attack: function(caster, target) {
            var dmg;
            switch (caster.species) {
                case 'goblin': dmg = 1; break;
                case 'ogre': dmg = 2; break;
                case 'troll': dmg = 3; break;
                case 'giant': dmg = 4; break;
            }
            if (target.is_shielded || target.has_counterspell) {
                return caster.name + ' launches himself uselessly against ' + target.name + "'s magical shield.\n";
            } else {
                if (target.pending_cure_wounds >= dmg) {
                    target.pending_cure_wounds -= dmg;
                    return caster.name + " attacks " + target.name + '. ' + target.name + ' looks unharmed.\n';
                } else {
                    dmg -= target.pending_cure_wounds;
                    target.takeDamage(dmg);
                    target.pending_cure_wounds = 0;
                    return caster.name + " attacks " + target.name + ' for ' + this._points(dmg) + ' of damage.\n';
                }
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
                if (caster.has_mirror) {
                    return "For a brief moment, " + caster.name + "'s missile spell reflects infinitely between " + target.name + "'s magic mirror and his own; then it attenuates to nothing.\n";
                } else if (caster.is_shielded || caster.has_counterspell) {
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
        _effect_lightningbolt: function(caster, target) {
            if (target.has_counterspell) {
                return caster.name + ' hurls a lightning bolt at ' + this._himself(caster, target) + '. It has no effect.\n';
            } else if (target.has_mirror && target != caster) {
                if (caster.has_mirror) {
                    return "For a brief moment, " + caster.name + "'s lightning bolt reflects infinitely between " + target.name + "'s magic mirror and his own; then it attenuates to nothing.\n";
                } else if (caster.has_counterspell) {
                    return caster.name + "'s lightning bolt reflects from " + target.name + "'s magic mirror and strikes " + caster.name + ". It has no effect.\n";
                } else {
                    if (caster.pending_cure_wounds >= 5) {
                        caster.pending_cure_wounds -= 5;
                        return caster.name + "'s lightning bolt reflects from " + target.name + "'s magic mirror.\n" +
                               'The bolt strikes ' + caster.name + ' instead! ' + caster.name + ' looks unharmed.\n';
                    } else {
                        var dmg = 5 - caster.pending_cure_wounds;
                        caster.takeDamage(dmg);
                        caster.pending_cure_wounds = 0;
                        return caster.name + "'s lightning bolt reflects from " + target.name + "'s magic mirror.\n" +
                               'The bolt strikes ' + caster.name + ' for ' + this._points(dmg) + ' of damage instead!\n';
                    }
                }
            } else {
                if (target.pending_cure_wounds >= 5) {
                    target.pending_cure_wounds -= 5;
                    return caster.name + ' hurls a lightning bolt at ' + this._himself(caster, target) + '. ' + target.name + ' looks unharmed.\n';
                } else {
                    var dmg = 5 - target.pending_cure_wounds;
                    target.takeDamage(dmg);
                    target.pending_cure_wounds = 0;
                    return caster.name + ' hurls a lightning bolt at ' + this._himself(caster, target) + ' for ' + this._points(dmg) + ' of damage.\n';
                }
            }
        },
        _effect_lightningboltoneuse: function(caster, target) {
            if (caster.has_used_lightning_bolt) {
                return caster.name + ' attempts to hurl a lightning bolt, but has already used up his one lightning bolt for today.\n';
            }
            caster.has_used_lightning_bolt = true;
            return this._effect_lightningbolt(caster, target);
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
        _points: function(dmg) {
            if (dmg == 1) {
                return '1 point';
            } else {
                return dmg + ' points';
            }
        }
    };
    waving_hands._initSpellList();
    waving_hands._newGame();
    return waving_hands;
}
