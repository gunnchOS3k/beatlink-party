/** Actual versioned HTTP routes. Trusted producer binding has NO HTTP endpoint. */
import {
  endGame, openGameSessionOnRoom, publishRematchOrExit, disconnectGuest,
  publishResult, reconnectGuest, redeemInvitationOnRoom, rematchGame,
  startGame, submitRuntimeRaceResult,
} from './gameSessionContract.mjs';

export function registerGameSessionRoutes(app) {
  app.post('/game-sessions', (req, res) => {
    const body = req.body ?? {};
    if (body.hostSession || body.hostId || body.runtimeSession) {
      return res.status(400).json({ error: 'Credentials are server-issued' });
    }
    const opened = openGameSessionOnRoom(String(body.applicationId ?? ''));
    if ('error' in opened) return res.status(opened.status).json({ error: opened.error });
    return res.status(200).json(opened);
  });

  app.post('/game-sessions/:code/redeem', (req, res) => {
    // Verify the target room before consuming an invitation or creating membership.
    const outcome = redeemInvitationOnRoom(String(req.body?.invitation ?? ''), req.params.code);
    if ('error' in outcome) return res.status(outcome.status).json({ error: outcome.error });
    return res.status(200).json(outcome);
  });

  app.post('/game-sessions/:code/runtime-result', (req, res) => {
    const code = req.params.code.toUpperCase();
    if (req.body?.roomCode && String(req.body.roomCode).toUpperCase() !== code) {
      return res.status(400).json({ error: 'Result is for a different route room' });
    }
    const header = req.get('authorization') ?? '';
    const runtimeSession = header.startsWith('Bearer ') ? header.slice(7) : '';
    const outcome = submitRuntimeRaceResult({ ...(req.body ?? {}), roomCode: code }, runtimeSession);
    if ('error' in outcome) return res.status(outcome.status).json({ error: outcome.error, ...('message' in outcome ? { message: outcome.message } : {}) });
    return res.status(200).json({ result: outcome.result });
  });

  app.post('/game-sessions/:code/result', (req, res) => {
    const outcome = publishResult(String(req.body?.hostSession ?? ''), {
      runtimeDigest: typeof req.body?.runtimeDigest === 'string' ? req.body.runtimeDigest : '',
    }, req.params.code);
    if ('error' in outcome) return res.status(outcome.status).json({ error: outcome.error });
    return res.status(200).json({ event: outcome.event });
  });

  app.post('/game-sessions/:code/:action', (req, res) => {
    const { code, action } = req.params;
    const presented = String(req.body?.session ?? '');
    const outcome = action === 'start' ? startGame(presented, code)
      : action === 'rematch' ? rematchGame(presented, code)
      : action === 'end' ? endGame(presented, code)
      : action === 'disconnect' ? disconnectGuest(presented, code)
      : action === 'reconnect' ? reconnectGuest(presented, code)
      : action === 'rematch-or-exit' ? publishRematchOrExit(presented, req.body?.choice, code)
      : null;
    if (!outcome) return res.status(404).json({ error: 'Unknown game session action' });
    if ('error' in outcome) return res.status(outcome.status).json({ error: outcome.error });
    return res.status(200).json(outcome);
  });
}
