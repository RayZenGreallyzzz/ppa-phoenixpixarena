import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const src=path.join(ROOT,'tools','melee-contact-lab-20261003.html');
const dst=path.join(ROOT,'public','melee-contact-lab.html');
if(!fs.existsSync(src))throw new Error('Melee lab source missing: '+src);
if(!fs.existsSync(path.join(ROOT,'public','game','Assassin.glb')))throw new Error('Melee lab requires Player3D models to be published first');
fs.copyFileSync(src,dst);
const html=fs.readFileSync(dst,'utf8');
for(const token of ['PPA · безопасный стенд ближнего боя','Assassin.glb','Berserker_Final.glb','Paladin_Final.glb','Tank_Mobile_Shield_Hammer_Final.glb','Подбежать + ударить','Сохранить preset']){
  if(!html.includes(token))throw new Error('Melee lab output missing '+token);
}
console.log('PPA melee contact lab published: /melee-contact-lab.html');
