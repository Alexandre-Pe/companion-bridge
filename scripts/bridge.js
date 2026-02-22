Hooks.once('ready', () => {
    console.log("Companion Bridge | Ready and listening");

    // Listen for events sent by the Python App
    game.socket.on('module.companion-bridge', async (data) => {
        
        // Only the GM should reply to avoid duplicate responses
        if (!game.user.isGM) return;
        console.log("Companion Bridge | Received data:", data);

        // --- HANDLER 1: GET DATA ---
        if (data.action === 'GET_ACTOR_DERIVED') {
            const actor = game.actors.get(data.actorId);
            
            if (!actor) return;
            // 1. Snapshot the System Data
            // We use deepClone to create a plain JS object with the current values.
            const systemData = {};
            for (const [key, value] of Object.entries(actor.system)) {
                if (typeof value === 'object' && value !== null) {
                    systemData[key] = foundry.utils.deepClone(value);
                } else {
                        systemData[key] = value;
                }
            };
            if (systemData.attributes && systemData.attributes.hd) {
                systemData.attributes.hd = systemData.attributes.hd.bySize;
            }

            // 2. Snapshot the Items (and their derived labels/stats)
            const itemsData = actor.items.map(i => {
                return {
                    ...i.toObject(), // Get ID, name, img
                    system: foundry.utils.deepClone(i.system), // Get calculated item stats
                    effects: foundry.utils.deepClone(i.effects), // Get active effects on the item
                    flags: i.flags
                };
            });

            const effectsData = actor.effects.map(e => {
                return {
                    ...e.toObject(),
                    system: foundry.utils.deepClone(e.system)
                };
            });

            // 3. Construct the Payload manually
            const payload = {
                id: actor.id,
                name: actor.name,
                img: actor.img,
                prototypeToken: actor.prototypeToken,
                system: systemData, 
                items: itemsData,
                effects: effectsData
            };

            game.socket.emit('module.companion-bridge', {
                type: 'RESPONSE',
                requestId: data.requestId,
                actor: payload
            });
        }
        // --- HANDLER 2: UPDATE DATA ---
        if (data.action === 'UPDATE_ACTOR') {
            const actor = game.actors.get(data.actorId);
            if (!actor) return;

            console.log("Companion Bridge | Updating Actor:", data.actorId, data.updateData);

            // Execute the update
            await actor.update(data.updateData);
        }
        // --- HANDLER 3: REST ---
        if (data.action === 'REST') {
            const actor = game.actors.get(data.actorId);
            if (!actor) return;

            console.log("Companion Bridge | Resting Actor:", data.actorId, data.restType, data.options);

            if (data.restType === 'short') {
                await actor.shortRest(data.options);
            } else if (data.restType === 'long') {
                await actor.longRest(data.options);
            } else {
                console.warn("Companion Bridge | Unknown rest type:", data.restType);
            }
        }
        // --- HANDLER 4: ROLL ATTACK & DAMAGE ---
        if (data.action === 'ROLL_ATTACK') {
            const actor = game.actors.get(data.actorId);
            if (!actor) return console.warn("Bridge | Actor not found:", data.actorId);
            
            const item = actor.items.get(data.itemId);
            if (!item) return console.warn("Bridge | Item not found:", data.itemId);

            // 1. Resolve Activity
            let activity = data.activityId 
                ? item.system.activities?.get(data.activityId) 
                : item.system.activities?.find(a => a.type === "attack");

            if (!activity) return console.warn(`Bridge | No Attack Activity found on ${item.name}`);

            const clientOpts = data.options || {};
            const isFastForward = clientOpts.fastForward !== false; // Default to true if undefined

            // --- STEP A: ROLL ATTACK ---
            const dummyEvent = { 
                preventDefault: () => {},
                stopPropagation: () => {},
                target: { closest: () => null }
            };

            const attackConfig = {
                event: {
                    ...dummyEvent,
                    shiftKey: clientOpts.fastForward || false,
                    altKey: clientOpts.advantage || false,
                    ctrlKey: clientOpts.disadvantage || false,
                },
                ammunition: clientOpts.ammunition || undefined,
                attackMode: clientOpts.attackMode || undefined, 
                mastery: clientOpts.mastery || undefined,
                rolls: [{
                    options: {
                        advantage: clientOpts.advantage,
                        disadvantage: clientOpts.disadvantage
                    },
                    parts: clientOpts.bonus ? [clientOpts.bonus] : []
                }]
            };

            const dialogConfig = { configure: !isFastForward };
            const messageConfig = { create: true };

            try {
                // 1. EXECUTE ATTACK
                const attackRolls = await activity.rollAttack(attackConfig, dialogConfig, messageConfig);

                // If user closed dialog or roll failed
                if (!attackRolls || attackRolls.length === 0) return; 

                const attackResult = attackRolls[0];
                const isCritical = attackResult.isCritical;
                const isFumble = attackResult.isFumble;

                // --- STEP B: ROLL DAMAGE ---
                
                let damageRolls = [];
                
                if (activity.damage?.parts?.length > 0) {

                    const damageConfig = {
                        event: dummyEvent,
                        
                        // FIX: 'critical' must be at the top level of the config object
                        isCritical: isCritical,
                    };

                    // We reuse the same dialog/message config
                    // dialogConfig is still { configure: false } so it auto-rolls
                    damageRolls = await activity.rollDamage(damageConfig, dialogConfig, messageConfig);
                }

                // --- STEP C: SEND RESPONSE ---
                
                const responsePayload = {
                    type: 'ROLL_RESULT',
                    requestId: data.requestId,
                    
                    // Attack Data
                    attack: {
                        total: attackResult.total,
                        formula: attackResult.formula,
                        // Extract dice details for UI visualization
                        dice: attackResult.dice.map(d => ({
                            faces: d.faces,
                            results: d.results.map(r => r.result)
                        })),
                        isCritical: isCritical,
                        isFumble: isFumble
                    },

                    // Damage Data
                    damage: damageRolls.map(d => ({
                        total: d.total,
                        formula: d.formula,
                        type: d.options.type, 
                        isCritical: d.options.critical || d.options.isCritical // Check both flags
                    }))
                };

                game.socket.emit('module.companion-bridge', responsePayload);

            } catch (err) {
                console.error("Bridge | Roll Failed:", err);
                game.socket.emit('module.companion-bridge', {
                    type: 'ROLL_ERROR',
                    requestId: data.requestId,
                    message: err.message
                });
            }
        }
    });
});