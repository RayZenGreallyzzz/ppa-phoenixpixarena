import re,base64,gzip,io,json
from PIL import Image

src=gzip.decompress(b''.join(open(f'PPA{i:02d}.bin','rb').read() for i in range(1,13))).decode('utf-8')
names=['PALADIN_IDLE_SRC','PALADIN_RUN_SRC','PALADIN_ATTACK_SRC']
out={}
for name in names:
    m=re.search(r"const "+name+r"='data:image/png;base64,([^']+)'",src)
    if not m:
        out[name]={'error':'not found'}; continue
    im=Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert('RGBA')
    rows=[]
    for ry in range(4):
        row=[]
        for rx in range(4):
            c=im.crop((rx*256,ry*256,(rx+1)*256,(ry+1)*256))
            a=c.getchannel('A')
            pix=a.load()
            seen=set(); comps=[]
            for y in range(256):
                for x in range(256):
                    if pix[x,y] < 20 or (x,y) in seen: continue
                    stack=[(x,y)]; seen.add((x,y)); pts=[]
                    while stack:
                        px,py=stack.pop(); pts.append((px,py))
                        for nx in (px-1,px,px+1):
                            for ny in (py-1,py,py+1):
                                if nx==px and ny==py: continue
                                if 0<=nx<256 and 0<=ny<256 and (nx,ny) not in seen and pix[nx,ny]>=20:
                                    seen.add((nx,ny)); stack.append((nx,ny))
                    if len(pts)>=3:
                        xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
                        comps.append({'area':len(pts),'bbox':[min(xs),min(ys),max(xs)+1,max(ys)+1]})
            comps.sort(key=lambda z:z['area'],reverse=True)
            row.append(comps[:10])
        rows.append(row)
    out[name]={'size':im.size,'frames':rows}
open('diag-paladin-components.json','w').write(json.dumps(out,ensure_ascii=False,indent=2))
