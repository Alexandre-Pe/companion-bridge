Hooks.once('ready', () => {
    console.log("Companion Bridge | Ready and listening");

    // Listen for events sent by the Python App
    game.socket.on('module.companion-bridge', async (data) => {
        
        // Only the GM should reply to avoid duplicate responses
        if (!game.user.isGM) return;

        if (data.action === 'GET_ACTOR_DERIVED') {
            const actor = game.actors.get(data.actorId);
            
            if (!actor) return;
            // 1. Snapshot the System Data
            // We use deepClone to create a plain JS object with the current values.
            const systemData = foundry.utils.deepClone(actor.system);

            // 2. Snapshot the Items (and their derived labels/stats)
            const itemsData = actor.items.map(i => {
                return {
                    ...i.toObject(), // Get ID, name, img
                    system: foundry.utils.deepClone(i.system), // Get calculated item stats
                    effects: foundry.utils.deepClone(i.effects.map(e => e.system)), // Get active effects on the item
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
                system: systemData, // This now contains the AC/Spells/etc
                items: itemsData,
                effects: effectsData
            };

            game.socket.emit('module.companion-bridge', {
                type: 'RESPONSE',
                requestId: data.requestId,
                actor: payload
            });
        }
    });
});