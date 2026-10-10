import { clanForAuthenticatedNativePlayer } from './clan-online.js';
import { executeNativeCommandOnce } from './native-action-ledger.js';

export const NATIVE_CLAN_ACTIONS = Object.freeze([
  'create','apply','leaveClan','acceptApplication','rejectApplication',
  'kickMember','transferLeadership','setPermissions','setAuthority','upgradeBonus'
]);
const allowedFields = {
  create:['name'], apply:['name'], leaveClan:[],
  acceptApplication:['applicationId'], rejectApplication:['applicationId'],
  kickMember:['memberId'], transferLeadership:['memberId'],
  setPermissions:['memberId','permissions'], setAuthority:['memberId','authority'],
  upgradeBonus:['bonusKey']
};

export function nativeClanCommand(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const action = body.action;
  if (!NATIVE_CLAN_ACTIONS.includes(action)) return null;
  const command = {service:'clan', action};
  for (const field of allowedFields[action]) {
    if (field === 'permissions' || field === 'authority') {
      const data = body[field];
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      if (field === 'authority') {
        command[field] = Object.fromEntries(['acceptMembers','viewClanHistory','manageStorageRights','manageMembers']
          .map(key => [key, data[key] === true]));
      } else {
        // Item selection rights need a verified inventory ID contract. For
        // now use the original none/all modes, never trust client item maps.
        if (!['none','all'].includes(data.withdrawMode)) return null;
        command[field] = {canDeposit:data.canDeposit === true, withdrawMode:data.withdrawMode, allowed:{}};
      }
    } else {
      if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > 80) return null;
      command[field] = body[field].trim();
    }
  }
  return command;
}

export async function nativeClanOperation(env, ownerId, operation, body = {}) {
  const envelope = data => ({...data, gameId:'phoenix-pix-arena', contract:'ppa-clan-v1',
    ownerId:String(ownerId), actions:env.PPA_GODOT_CLAN_ACTIONS_ENABLED === '1' ? [...NATIVE_CLAN_ACTIONS] : []});
  const dispatch = async command => {
    const response = await clanForAuthenticatedNativePlayer(env, ownerId, operation, command);
    const data = envelope(await response.json());
    if (operation === 'action') {
      data.requestId = body.requestId;
      data.commandStatus = 'done';
    }
    return {status:response.status, data};
  };
  if (operation === 'state') return dispatch({});
  if (env.PPA_GODOT_CLAN_ACTIONS_ENABLED !== '1')
    return {status:404, data:{ok:false,code:'NOT_FOUND',message:'Game API route not found'}};
  const command = nativeClanCommand(body);
  if (!command) return {status:400,data:{ok:false,code:'INVALID_CLAN_ACTION',message:'Действие клана не поддерживается.'}};
  // Owner comes from the signed Phoenix session. Identity, rewards, item data
  // and client save fields are never forwarded to the canonical clan rules.
  return executeNativeCommandOnce(env, String(ownerId), body.requestId, command, () => dispatch(command));
}
