Hooks.once('ready', () => {
    console.log("Companion Bridge | Ready and listening");

    // Listen for events sent by the Python App
    game.socket.on('module.companion-bridge', async (data) => {
        
        // Only the GM should reply to avoid duplicate responses
        if (!game.user.isGM) return;

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
    });
});