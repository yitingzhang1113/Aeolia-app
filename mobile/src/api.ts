export type Person = {id:number;handle:string;name:string;city:string;job:string;bio:string;interests:string[];outfit:string;mutual?:boolean;agent_discoverable?:boolean;agent_chat_allowed?:boolean;preference_note?:string};
export type Circle = {id:number;name:string;description:string;follow:boolean;explore:boolean};
export type Post = {id:number;author:Person;body:string;visibility:string;circle_id:number|null;media_url?:string|null;media_type?:string};
export type Encounter = {id:number|null;candidate?:Person;reason?:string;evidence?:{post_id:number;excerpt:string}[];path?:string[];status?:string;message?:string};
export type Detail = Encounter & {turns:{speaker_id:number;body:string}[]};
// iOS Simulator uses localhost. On a physical phone set EXPO_PUBLIC_API_URL to your computer's LAN address.
const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
export async function api<T>(path:string, options:RequestInit = {}, userId = 1):Promise<T> {
  const response = await fetch(BASE + path, {...options, headers:{'Content-Type':'application/json','X-User-Id':String(userId),...options.headers}});
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { const body = await response.json(); message = String(body.detail || message); } catch {}
    throw new Error(message);
  }
  return response.json();
}
export const json = (method:string, body:unknown):RequestInit => ({method,body:JSON.stringify(body)});
