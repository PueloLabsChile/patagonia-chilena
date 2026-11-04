# Agrega la población del Censo 2024 (personas censadas: manzanas urbanas + entidades rurales) a datos/comunas.json
import sqlite3, json, os
GPKG = r'C:/Users/piali/Desktop/propiedades/data/Cartografia_censo2024_Pais.gpkg'
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'datos', 'comunas.json')
c = sqlite3.connect('file:' + GPKG + '?mode=ro&immutable=1', uri=True)
pob = {}
for t in ('Manzanas_CPV24', 'Entidades_CPV24'):
    for cut, n in c.execute(f'select CUT, sum(n_per) from {t} group by CUT'):
        pob[int(cut)] = pob.get(int(cut), 0) + int(n or 0)
L = json.load(open(D, encoding='utf8'))
for x in L: x['p'] = pob.get(x['c'], 0)
json.dump(L, open(D, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
reg = {}
for x in L: reg[x['r']] = reg.get(x['r'], 0) + x['p']
print('total', sum(reg.values()), reg)
print('sin población:', [x['n'] for x in L if not x['p']])
