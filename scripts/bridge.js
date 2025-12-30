Hooks.once('ready', () => {
    console.log("Companion Bridge | Ready and listening");

    // Listen for events sent by the Python App
    game.socket.on('module.companion-bridge', async (data) => {
        
        // Only the GM should reply to avoid duplicate responses
        if (!game.user.isGM) return;

        if (data.action === 'GET_ACTOR_DERIVED') {
            const actor = game.actors.get(data.actorId);
            
            if (!actor) return;
            console.log(actor.system.attributes); // Confirmed that it contains all the derived data

            // Emit back to the Python App
            // We use the same event name, the Python app needs to filter by checking if it's a response
            game.socket.emit('module.companion-bridge', {
                type: 'RESPONSE',
                requestId: data.requestId,
                actor: actor, // For some reason sending the whole actor doesn't include derived data anymore :\
                ac: actor.system.attributes.ac.value, // Testing if we can send them
                spells: actor.system.spells,
            });
        }
    });
});