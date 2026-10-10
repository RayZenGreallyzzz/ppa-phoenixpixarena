#!/usr/bin/env python3
"""Rebuild one canonical forging catalog from the checksum-pinned ORIGINAL PPA.

No live requests, secrets, accounts or database access. Output JSON is checked
into GitHub and used by the same server as Telegram/Godot; fail closed if the
original smith formula/catalog drifts.
"""
from __future__ import annotations
import gzip
import hashlib
import html
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA = "a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7"
OUTPUT = ROOT / "src" / "shared-forge-recipes.generated.json"

class SmithParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.smith = []
    def handle_starttag(self, tag, attrs):
        if tag == "iframe":
            attrs = dict(attrs)
            if attrs.get("id") == "blacksmithFrame":
                self.smith.append(attrs.get("srcdoc",""))

def unpack_smith():
    packed = b"".join((ROOT/f"PPA{i:02d}.bin").read_bytes() for i in range(1,13))
    data = gzip.decompress(packed)
    if hashlib.sha256(data).hexdigest() != SOURCE_SHA:
        raise RuntimeError("Canonical Telegram PPA source has changed")
    parser = SmithParser()
    parser.feed(data.decode("utf-8"))
    if len(parser.smith) != 1:
        raise RuntimeError("Original blacksmithFrame missing or duplicated")
    return parser.smith[0]

def js_json(smith, variable, kind):
    match = re.search(r"\bconst\s+" + re.escape(variable) + r"\s*=\s*",smith)
    if match is None:
        raise RuntimeError("Original smith constant missing: "+variable)
    value,_ = json.JSONDecoder().raw_decode(smith[match.end():])
    if not isinstance(value,kind):
        raise RuntimeError("Original smith changed shape: "+variable)
    return value

def multiplier(smith):
    m = re.search(r"\bconst\s+CRAFT_RESOURCE_MULT\s*=\s*\{([^{}]+)\}",smith)
    if not m:
        raise RuntimeError("Original rarity multiplier missing")
    return {k:int(v) for k,v in re.findall(r"\b(\w+):(\d+)",m.group(1))}

def quantities(smith,func):
    m = re.search(r"function\s+"+re.escape(func)+r"\s*\([^)]*\)\s*\{",smith)
    if not m:
        raise RuntimeError("Original quantity formula missing: "+func)
    block=smith[m.end():m.end()+500]
    triples={k:list(map(int,(a,b,c))) for k,a,b,c in
             re.findall(r"\b(common|uncommon|rare|epic):\s*\[\s*(\d+),\s*(\d+),\s*(\d+)\s*\]",block)}
    if len(triples)<3 or "return base.map(v=>v*mult)" not in block:
        raise RuntimeError("Original quantity formula changed: "+func)
    return triples

def req(materials,counts):
    if len(materials)<len(counts):
        raise RuntimeError("Original material names insufficient")
    return [{"name":materials[i],"count":int(counts[i])} for i in range(len(counts))]

def js_numeric_map(smith,name):
    # Only the original literal numeric object is permitted; no expressions,
    # variable references or JS evaluation of arbitrary source.
    match=re.search(r"\b(?:const|var)\s+"+re.escape(name)+r"\s*=\s*(\{)",smith)
    if not match:
        raise RuntimeError("Original item stats missing: "+name)
    p=match.start(1); depth=0; quoted=False; escaped=False; end=None
    for i in range(p,len(smith)):
        c=smith[i]
        if quoted:
            if escaped: escaped=False
            elif c=="\\": escaped=True
            elif c=="'": quoted=False
        elif c=="'": quoted=True
        elif c=="{": depth+=1
        elif c=="}":
            depth-=1
            if depth==0:
                end=i+1
                break
    if end is None or end-p>60000:
        raise RuntimeError("Unexpected stats object size")
    literal=smith[p:end]
    literal=re.sub(r"\b([A-Za-z]\w*)\s*:",r'"\1":',literal)
    literal=literal.replace("'",'"')
    try: result=json.loads(literal)
    except json.JSONDecodeError as e:
        raise RuntimeError("Original stats map is no longer a numeric literal: "+name) from e
    if not isinstance(result,dict):
        raise RuntimeError("Stat map not a dictionary")
    def all_numeric(values):
        return isinstance(values,dict) and all(
            isinstance(n,(int,float)) and not isinstance(n,bool) for n in values.values())
    for kind,tiers in result.items():
        if not isinstance(tiers,dict): raise RuntimeError("Stat tier not object")
        if all_numeric(tiers): continue  # NECKLACE rarity -> stats
        for rarity,vals in tiers.items():
            if not all_numeric(vals):
                raise RuntimeError("Non-numeric original stats: "+kind+"/"+rarity)
    return result

def legendary_offers(smith):
    m=re.search(r"\bLEGENDARY_CRAFT\s*=\s*\[(.*?)\];",smith,re.S)
    if m is None:
        raise RuntimeError("Original legendary equipment crafting list not found")
    parsed=[]
    for item in re.findall(r"\{([^{}]+)\}",m.group(1)):
        props={}
        for key,string,num in re.findall(r"(\w+)\s*:\s*(?:'([^']*)'|(\d+))",item):
            props[key]=int(num) if num else string
        if not {"name","slot","kind","icon","price","mat"}<=props.keys():
            raise RuntimeError("Original legendary equipment entry changed")
        if props["kind"] not in ("gear","accessory"):
            raise RuntimeError("Unsupported legendary kind")
        parsed.append(props)
    if len(parsed)<5 or len({x["slot"] for x in parsed})!=len(parsed):
        raise RuntimeError("Original legendary crafting list incomplete")
    return parsed

def generate():
    smith=unpack_smith()
    gear=js_json(smith,"GEAR",list)
    acc=js_json(smith,"ACC",dict)
    pets=js_json(smith,"PETS",dict)
    mult=multiplier(smith)
    acc_qty=quantities(smith,"qtyForRarity")
    pet_qty=quantities(smith,"petQty")
    values=js_numeric_map(smith,"ACCESSORY_STAT_VALUES")
    necklaces=js_numeric_map(smith,"NECKLACE_STAT_VALUES")
    # NECKLACE_STAT_VALUES is a simple rarity -> numeric object, unlike
    # ACCESSORY_STAT_VALUES (slot -> rarity -> object).
    recipes=[]
    for row in gear:
        materials=req(row["mats"],[24*mult["epic"],16*mult["epic"],8*mult["epic"]])
        materials.append({"name":"Перо Феникса","count":2})
        recipes.append({"id":"gear:epic:"+row["slot"],"tab":"equipment",
            "kind":"gear","slot":row["slot"],"rarity":"epic",
            "name":row["name"],"icon":row.get("icon","◆"),
            "price":int(row["price"]),"currency":"ppa","materials":materials})
    for kind,item in acc.items():
        for rarity,price in item.get("prices",{}).items():
            if rarity not in ("common","uncommon","rare","epic","legendary"):
                raise RuntimeError("Unknown rarity "+rarity)
            if rarity=="legendary":
                materials=[{"name":"Кристалл Бездны","count":1000}]
                price=12000
            else:
                q=acc_qty[rarity]
                materials=req(item["mats"],[n*mult[rarity] for n in q])
                if rarity=="epic":
                    materials.append({"name":"Перо Феникса","count":1})
            recipes.append({"id":f"acc:{kind}:{rarity}",
                "tab":"legendary" if rarity=="legendary" else "accessories",
                "kind":"gear" if kind=="ring" else "wings" if kind=="wings" else "accessory",
                "slot":"ring" if kind=="ring" else kind,"accessoryKind":kind,
                "rarity":rarity,"name":str(item.get("name",kind)),"icon":item.get("icon","◆"),
                "price":int(price),"currency":"ppa","materials":materials,
                "bonusText":" · ".join(item.get("stats",{}).get(rarity,[]))})
    for name,item in pets.items():
        for rarity,price in (("common",500),("uncommon",1200),("rare",3000)):
            q=pet_qty[rarity]
            recipes.append({"id":f"pet:{name}:{rarity}","tab":"pets",
                "kind":"pet","slot":"pet","rarity":rarity,
                "name":name,"petName":name,"icon":"🐾","price":price,
                "currency":"ppa","materials":req(item["mats"],[n*mult[rarity] for n in q]),
                "bonusText":str(item.get("bonus",{}).get(rarity,""))})
    for item in legendary_offers(smith):
        recipes.append({"id":f"legend:{item['kind']}:{item['slot']}",
            "tab":"legendary","kind":item["kind"],"slot":item["slot"],
            "accessoryKind":item["slot"] if item["kind"]=="accessory" else None,
            "rarity":"legendary","name":item["name"],"icon":item["icon"],
            "price":item["price"],"currency":"ppa",
            "materials":[{"name":item["mat"],"count":1000}],
            "bonusText":"Легендарный тир"})
    if len(gear)!=7 or len(acc)<5 or len(pets)<7:
        raise RuntimeError("Canonical PPA category count unexpectedly changed")
    keys=[item["id"] for item in recipes]
    if len(keys)!=len(set(keys)):
        raise RuntimeError("Two original forge recipes share an ID")
    data={"sourceSha256":SOURCE_SHA,"smithSha256":hashlib.sha256(smith.encode()).hexdigest(),
          "offers":recipes,"accessoryStats":values,"necklaceStats":necklaces}
    return data

if __name__=="__main__":
    data=generate()
    body=json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n"
    if "--print-json" in sys.argv:
        print("PPA_SHARED_FORGE_JSON_BEGIN")
        print(body,end="")
        print("PPA_SHARED_FORGE_JSON_END")
    elif "--verify" in sys.argv:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8")!=body:
            raise SystemExit("Generated forge catalog is stale or absent")
    else:
        OUTPUT.write_text(body,encoding="utf-8")
    print("PPA_SHARED_FORGE_FULL_CATALOG_OK recipes="+str(len(data["offers"]))+
          " accessory_tiers="+str(len(data["accessoryStats"]))+
          " images=client_assets same_save=1",file=sys.stderr,flush=True)
