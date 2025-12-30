Hooks.once('ready', () => {
    console.log("Companion Bridge | Ready and listening");

    // Listen for events sent by the Python App
    game.socket.on('module.companion-bridge', async (data) => {
        
        // Only the GM should reply to avoid duplicate responses
        if (!game.user.isGM) return;

        if (data.action === 'GET_ACTOR_DERIVED') {
            const actor = game.actors.get(data.actorId);
            
            if (!actor) return;

            // actor.system contains the derived data because the Client has already run prepareData()
            const payload = {
                actor_data: actor
            };

            // Emit back to the Python App
            // We use the same event name, the Python app needs to filter by checking if it's a response
            game.socket.emit('module.companion-bridge', {
                type: 'RESPONSE',
                requestId: data.requestId,
                actor: payload
            });
        }
    });
});