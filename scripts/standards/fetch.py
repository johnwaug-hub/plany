# Rebuild step 1 of 2: download standard sets from the Common Standards Project into /tmp/stds/raw (~6,700 sets, ~25 min).
# Run from any folder: python3 fetch.py   then   python3 build.py   and copy /tmp/stds/out/*.json to public/standards/
import json, os, re, time, urllib.request, concurrent.futures as cf
API='https://api.commonstandardsproject.com/api/v1'
def get(url, tries=4):
    for t in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r: return json.load(r)
        except Exception as e:
            time.sleep(2*(t+1))
    raise RuntimeError('failed '+url)
j=get(API+'/jurisdictions')['data']
CANADA={'Alberta','Alberta (Français)','British Columbia','Colombie-Britannique / British Columbia (Français)','Manitoba','New Brunswick','Nouveau-Brunswick (Français)','Nova Scotia','Ontario','Ontario (Français)','Quebec (English)','Québec (Français)','Saskatchewan','Newfoundland and Labrador','Prince Edward Island','Yukon','Northwest Territories','Nunavut'}
juris=[x for x in j if (x['type']=='state' and x['title'] not in CANADA)] + [x for x in j if x['title']=='Next Generation Science Standards']
CORE=re.compile(r'(english|ela\b|language arts|literacy|reading|writing|math|science|social studies|history|civics|government|geography|economics|health|physical education|arts|music|visual art|theat|dance|computer science|technology)', re.I)
EXCL=re.compile(r'(\bCTE\b|career|technical education|english language proficiency|\bELP\b|foreign|world and native|world language|early learning|early childhood|student leadership|formative)', re.I)
sets=[]
for ju in juris:
    d=get(API+'/jurisdictions/'+ju['id'])['data']
    for s in d['standardSets']:
        doc=s.get('document') or {}
        if (doc.get('publicationStatus') or '').lower()=='deprecated': continue
        if not CORE.search(s['subject']) or EXCL.search(s['subject']): continue
        lv=s.get('educationLevels') or []
        if lv and not any(l in lv for l in ['K','01','02','03','04','05','06','07','08','09','10','11','12']): continue
        sets.append((ju['title'], s['id'], s['subject'], s.get('title',''), lv, doc.get('title','')))
json.dump(sets, open('/tmp/stds/sets.json','w'))
print('sets', len(sets), flush=True)
def dl(item):
    sid=item[1]; path=f'/tmp/stds/raw/{sid}.json'
    if os.path.exists(path): return
    d=get(API+'/standard_sets/'+sid)['data']
    json.dump(d, open(path,'w'))
with cf.ThreadPoolExecutor(4) as ex:
    for i,_ in enumerate(ex.map(dl, sets)):
        if i%100==0: print('done', i, flush=True)
print('ALL DONE', flush=True)
