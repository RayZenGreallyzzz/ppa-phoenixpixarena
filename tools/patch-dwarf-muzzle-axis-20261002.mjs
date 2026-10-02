import fs from 'node:fs';

function read(p){return fs.readFileSync(p,'utf8')}
function write(p,s){fs.writeFileSync(p,s,'utf8')}
function functionRange(src,signature){
  const start=src.indexOf(signature);
  if(start<0)throw new Error('Missing '+signature);
  const open=src.indexOf('{',start+signature.length-1);
  let depth=0,state='code',quote='',esc=false;
  for(let i=open;i<src.length;i++){
    const ch=src[i],nx=src[i+1]||'';
    if(state==='line'){if(ch==='\n')state='code';continue}
    if(state==='block'){if(ch==='*'&&nx==='/'){state='code';i++}continue}
    if(state==='string'){if(esc){esc=false;continue}if(ch==='\\'){esc=true;continue}if(ch===quote){state='code';quote=''}continue}
    if(state==='template'){if(esc){esc=false;continue}if(ch==='\\'){esc=true;continue}if(ch==='`')state='code';continue}
    if(ch==='/'&&nx==='/'){state='line';i++;continue}
    if(ch==='/'&&nx==='*'){state='block';i++;continue}
    if(ch==='\''||ch==='"'){state='string';quote=ch;continue}
    if(ch==='`'){state='template';continue}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return[start,i+1];
  }
  throw new Error('Unclosed '+signature);
}
function replaceFunction(src,signature,replacement){const[a,b]=functionRange(src,signature);return src.slice(0,a)+replacement+src.slice(b)}

const p='gateway/player-3d-unified-runtime.js';
let s=read(p);
const fn=`function attachDwarfMuzzle(root){
    try{
      const cannon=root&&root.getObjectByName&&root.getObjectByName('DwarfCannon');
      if(!cannon||cannon.getObjectByName('PPA_DwarfMuzzle'))return cannon&&cannon.getObjectByName('PPA_DwarfMuzzle');
      const hand=(root.getObjectByName&&root.getObjectByName('LeftHand'))||cannon.parent||cannon;
      root.updateWorldMatrix(true,true);
      cannon.updateWorldMatrix(true,true);

      // PPA_DWARF_MUZZLE_GEOMETRY_AXIS_20261002
      // Sample the actual cannon mesh in DwarfCannon-local coordinates. The barrel
      // direction is derived from the mesh's geometric diameter, not from XYZ axes.
      const inv=new THREE.Matrix4().copy(cannon.matrixWorld).invert();
      const points=[];
      const v=new THREE.Vector3();
      cannon.traverse(o=>{
        const attr=o&&o.geometry&&o.geometry.attributes&&o.geometry.attributes.position;
        if(!attr||!Number.isFinite(attr.count)||attr.count<=0)return;
        const step=Math.max(1,Math.floor(attr.count/6000));
        for(let i=0;i<attr.count;i+=step){
          v.fromBufferAttribute(attr,i);
          try{if(o.isSkinnedMesh&&typeof o.applyBoneTransform==='function')o.applyBoneTransform(i,v)}catch(_){}
          v.applyMatrix4(o.matrixWorld).applyMatrix4(inv);
          points.push(v.clone());
        }
      });
      if(points.length<8)return null;

      const handLocal=new THREE.Vector3();
      hand.getWorldPosition(handLocal);handLocal.applyMatrix4(inv);
      const farthestFrom=q=>{
        let best=points[0],bestD=-1;
        for(const pt of points){const d=pt.distanceToSquared(q);if(d>bestD){bestD=d;best=pt}}
        return best;
      };
      const a=farthestFrom(points[0]);
      const b=farthestFrom(a);
      const axis=new THREE.Vector3().subVectors(b,a);
      if(axis.lengthSq()<1e-10)return null;
      axis.normalize();

      let minP=Infinity,maxP=-Infinity;
      for(const pt of points){const q=pt.dot(axis);if(q<minP)minP=q;if(q>maxP)maxP=q}
      const handP=handLocal.dot(axis);
      const towardMax=Math.abs(maxP-handP)>=Math.abs(minP-handP);
      const tipP=towardMax?maxP:minP;
      const span=Math.max(1e-6,maxP-minP);
      const band=Math.max(span*.08,span/120);

      // Average the outer 8% of the mesh to get the CENTER of the physical end,
      // then place the marker on the exact end plane. This avoids selecting a
      // random bounding-box corner or a sight/stock vertex.
      const pos=new THREE.Vector3();let n=0;
      for(const pt of points){
        const q=pt.dot(axis);
        if(towardMax?q>=tipP-band:q<=tipP+band){pos.add(pt);n++}
      }
      if(!n)return null;
      pos.multiplyScalar(1/n);
      pos.addScaledVector(axis,tipP-pos.dot(axis));

      const marker=new THREE.Object3D();
      marker.name='PPA_DwarfMuzzle';
      marker.userData.ppaMuzzleFromModel=true;
      marker.userData.ppaMuzzleMethod='geometry-diameter-endcap';
      marker.position.copy(pos);
      cannon.add(marker);
      marker.updateWorldMatrix(true,false);
      return marker;
    }catch(e){console.warn('PPA dwarf muzzle marker',e);return null}
  }`;
s=replaceFunction(s,'function attachDwarfMuzzle(root){',fn);
if(!s.includes('PPA_DWARF_MUZZLE_GEOMETRY_AXIS_20261002'))throw new Error('new muzzle axis marker missing');
write(p,s);

const pp='tools/postbuild-player-3d-unified-20261002.mjs';
let ps=read(pp);
if(!ps.includes('20261002u6'))throw new Error('runtime cache u6 missing');
ps=ps.split('20261002u6').join('20261002u7');
write(pp,ps);

const bp='build.mjs';
let bs=read(bp);
const old="const CLIENT_BUILD = 'v630-gnome-3d-muzzle-20261002';";
const next="const CLIENT_BUILD = 'v631-dwarf-muzzle-axis-20261002';";
if(!bs.includes(old))throw new Error('client build v630 missing');
bs=bs.replace(old,next);
write(bp,bs);

console.log('Patched DwarfCannon muzzle to geometry-derived longitudinal end-cap center');
