# Rebuild step 2 of 2: trim /tmp/stds/raw into one JSON file per jurisdiction in /tmp/stds/out (run from /tmp/stds).
import json, os, re, collections, gzip
sets=json.load(open('sets.json'))
ABBR={'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','District of Columbia':'DC','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY','Common Core State Standards':'CCSS','Next Generation Science Standards':'NGSS'}
def subj_group(s, ns):
    t=(s+' '+(ns or '')).lower()
    if re.search(r'math', t): return 'Math'
    if re.search(r'english|language arts|\bela\b|literacy|reading|writing', t): return 'ELA'
    if re.search(r'computer science|technology', t): return 'Computer Science'
    if re.search(r'social|history|civics|government|geography|economics', t): return 'Social Studies'
    if re.search(r'science', t): return 'Science'
    if re.search(r'physical education', t): return 'PE'
    if re.search(r'health', t): return 'Health'
    if re.search(r'art|music|theat|dance', t): return 'Arts'
    return 'Other'
GR={'K':'K','KG':'K','00':'K','01':'1','02':'2','03':'3','04':'4','05':'5','06':'6','07':'7','08':'8','09':'9','10':'10','11':'11','12':'12'}
clean=lambda x: re.sub(r'\s+',' ', re.sub(r'<[^>]+>','', x or '')).strip()
out=collections.defaultdict(lambda: {'sets':[]})
counts=collections.Counter()
for (jname, sid, subject, title, levels, doctitle) in sets:
    code=ABBR[jname]
    raw=json.load(open(f'raw/{sid}.json'))
    std=raw.get('standards') or {}
    grades=sorted({GR[l] for l in (raw.get('educationLevels') or levels) if l in GR}, key=lambda g: -1 if g=='K' else int(g))
    if not grades: continue
    items=list(std.values())
    maxd=max([i.get('depth',0) for i in items] or [0])
    byid={i['id']:i for i in items}
    has_children={i.get('parentId') for i in items}
    doms=[]; domidx={}
    rows=[]
    for it in sorted(items, key=lambda i: i.get('position',0)):
        note=(it.get('statementNotation') or '').strip()
        desc=clean(it.get('description'))
        if not desc: continue
        leaf = it['id'] not in has_children
        if not note and not leaf: continue
        # domain = top-most ancestor description (depth 0), else parent
        anc=[byid[a] for a in (it.get('ancestorIds') or []) if a in byid]
        anc.sort(key=lambda a: a.get('depth',0))
        dom=clean(anc[0]['description'])[:90] if anc else ''
        if dom not in domidx: domidx[dom]=len(doms); doms.append(dom)
        if len(desc)>400: desc=desc[:397]+'…'
        rows.append([note, desc, domidx[dom]])
    if not rows: continue
    g=subj_group(subject, raw.get('normalizedSubject'))
    out[code]['name']=jname
    out[code]['sets'].append({'id':sid[-40:], 'subject':subject, 'group':g, 'grades':grades, 'title':title, 'doc':clean(doctitle)[:120], 'domains':doms, 'standards':rows})
    counts[code]+=len(rows)
index=[]
os.makedirs('out', exist_ok=True)
tot=totgz=0
for code,data in sorted(out.items()):
    b=json.dumps({'code':code,'name':data['name'],'sets':data['sets']}, separators=(',',':'), ensure_ascii=False).encode()
    open(f'out/{code}.json','wb').write(b)
    gz=len(gzip.compress(b,9)); tot+=len(b); totgz+=gz
    groups=sorted({s['group'] for s in data['sets']})
    index.append({'code':code,'name':data['name'],'groups':groups,'count':counts[code],'kb':round(len(b)/1024),'gzkb':round(gz/1024)})
json.dump({'source':'Common Standards Project (commonstandardsproject.com), CC BY 3.0 US','built':'2026-09-28','jurisdictions':index}, open('out/index.json','w'), separators=(',',':'))
print('files', len(index), 'raw MB', round(tot/1e6,1), 'gz MB', round(totgz/1e6,1))
big=sorted(index, key=lambda x:-x['kb'])[:6]; print(big)
az=[x for x in index if x['code']=='AZ']; print(az)
