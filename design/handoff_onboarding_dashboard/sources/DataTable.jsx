
const SCHEMAS = [
  {
    id: 'person',
    title: 'Person',
    color: 'cyan',
    icon: 'user',
    description: 'Individuals registered in the identity platform.',
    properties: [
      { name: 'id', required: true, faker: { method: 'string.uuid' }, type: 'string', format: 'uuid' },
      { name: 'firstName', required: true, faker: { method: 'person.firstName' }, type: 'string' },
      { name: 'lastName', required: true, faker: { method: 'person.lastName' }, type: 'string' },
      { name: 'gender', required: false, faker: { method: 'person.sex' }, type: 'string', enum: ['male', 'female'] },
      { name: 'dateOfBirth', required: false, faker: { method: 'date.birthdate', args: [{ min: 18, max: 70, mode: 'age' }] }, type: 'string', format: 'date' },
      { name: 'email', required: true,
        faker: { method: 'internet.email', args: [{ firstName: { $ref: '#/properties/firstName' }, lastName: { $ref: '#/properties/lastName' } }] },
        type: 'string', format: 'email' },
      { name: 'nationalId', required: false, faker: { method: 'string.numeric', args: [{ length: 15 }] }, type: 'string' },
      { name: 'address', required: true, type: 'object', fields: [
        { name: 'street',  required: true,  faker: { method: 'location.streetAddress' }, type: 'string' },
        { name: 'area',    required: false, faker: { method: 'helpers.arrayElement', args: [['Reem Island','Yas Island','Al Maryah','Saadiyat']] }, type: 'string' },
        { name: 'city',    required: true,  faker: { method: 'location.city' }, type: 'string' },
        { name: 'country', required: true,  faker: { method: 'helpers.arrayElement', args: [['AE','SA','IN']] }, type: 'string' },
        { name: 'geo', required: false, type: 'object', fields: [
          { name: 'lat', required: true, faker: { method: 'location.latitude'  }, type: 'number' },
          { name: 'lng', required: true, faker: { method: 'location.longitude' }, type: 'number' },
        ]},
      ]},
      { name: 'phones', required: false, type: 'array', minItems: 1, maxItems: 3, items: {
        type: 'object', fields: [
          { name: 'label',   required: true,  faker: { method: 'helpers.arrayElement', args: [['home','work','mobile']] }, type: 'string' },
          { name: 'number',  required: true,  faker: { method: 'phone.number', args: ['+971-5#-###-####'] }, type: 'string' },
          { name: 'primary', required: false, faker: { method: 'datatype.boolean' }, type: 'boolean' },
        ]
      }},
      { name: 'tags', required: false, type: 'array', minItems: 0, maxItems: 4, items: { type: 'string', faker: { method: 'lorem.word' } } },
      { name: 'createdAt', required: false, faker: { method: 'date.past', args: [{ years: 2 }] }, type: 'string', format: 'date-time' },
    ],
  },
  {
    id: 'mobile',
    title: 'Mobile',
    color: 'violet',
    icon: 'phone',
    description: 'Mobile contact numbers belonging to a person.',
    properties: [
      { name: 'id', required: true, faker: { method: 'string.uuid' }, type: 'string', format: 'uuid' },
      { name: 'number', required: true, faker: { method: 'phone.number', args: ['+971-5#-###-####'] }, type: 'string' },
      { name: 'carrier', required: false, faker: { method: 'helpers.arrayElement', args: [['Etisalat', 'du', 'Virgin']] }, type: 'string' },
      { name: 'verified', required: false, faker: { method: 'datatype.boolean' }, type: 'boolean' },
      { name: 'personId', required: true, faker: { args: [{ $ref: '#/schema/person/id' }] }, type: 'string', format: 'uuid', isRef: true },
    ],
  },
  {
    id: 'driving-licence',
    title: 'Driving licence',
    color: 'emerald',
    icon: 'id-card',
    description: 'Government-issued driving licence linked to a person.',
    properties: [
      { name: 'licenceNumber', required: true, faker: { method: 'string.uuid' }, type: 'string', format: 'uuid' },
      { name: 'class', required: false, faker: { method: 'helpers.arrayElement', args: [['A', 'B', 'C', 'D']] }, type: 'string' },
      { name: 'issueDate', required: false, faker: { method: 'date.past', args: [{ years: 10 }] }, type: 'string', format: 'date' },
      { name: 'expiryDate', required: false, faker: { method: 'date.future', args: [{ years: 5 }] }, type: 'string', format: 'date' },
      { name: 'personId', required: true, faker: { args: [{ $ref: '#/schema/person/id' }] }, type: 'string', format: 'uuid', isRef: true },
      { name: 'mobileNumber', required: true, faker: { args: [{ $ref: '#/schema/mobile/number', fallback: { faker: { method: 'phone.number' } } }] }, type: 'string', isRef: true },
      { name: 'restrictions', required: false, type: 'array', minItems: 0, maxItems: 3, items: {
        type: 'object', fields: [
          { name: 'code',  required: true, faker: { method: 'helpers.arrayElement', args: [['01','02','03','04','05']] }, type: 'string' },
          { name: 'label', required: true, faker: { method: 'helpers.arrayElement', args: [['Glasses required','Daytime only','Auto only']] }, type: 'string' },
        ]
      }},
    ],
  },
];

const TOPO_ORDER = [
  { schemaId: 'person', name: 'id' },
  { schemaId: 'person', name: 'firstName' },
  { schemaId: 'person', name: 'lastName' },
  { schemaId: 'person', name: 'gender' },
  { schemaId: 'person', name: 'dateOfBirth' },
  { schemaId: 'person', name: 'email' },
  { schemaId: 'person', name: 'nationalId' },
  { schemaId: 'person', name: 'createdAt' },
  { schemaId: 'mobile', name: 'id' },
  { schemaId: 'mobile', name: 'number' },
  { schemaId: 'mobile', name: 'carrier' },
  { schemaId: 'mobile', name: 'verified' },
  { schemaId: 'mobile', name: 'personId' },
  { schemaId: 'driving-licence', name: 'licenceNumber' },
  { schemaId: 'driving-licence', name: 'class' },
  { schemaId: 'driving-licence', name: 'issueDate' },
  { schemaId: 'driving-licence', name: 'expiryDate' },
  { schemaId: 'driving-licence', name: 'personId' },
  { schemaId: 'driving-licence', name: 'mobileNumber' },
];

const ROWS = {
  person: [
    { id: '4f2e9c3a-7d11-4a89-8b1c-91e6a0d3f8c1', firstName: 'Khalid', lastName: 'Al-Mansoori', gender: 'male', dateOfBirth: '1986-03-14', email: 'khalid.al-mansoori@hotmail.ae', nationalId: '784198603141234',
      address: { street: 'King Khalid bin Abdulaziz St', area: 'Reem Island', city: 'Abu Dhabi', country: 'AE', geo: { lat: 24.4977, lng: 54.4023 } },
      phones: [ { label: 'mobile', number: '+971-50-123-4477', primary: true }, { label: 'work', number: '+971-2-441-7099', primary: false } ],
      tags: ['vip','verified'], createdAt: '2025-08-12T09:14:02Z' },
    { id: 'b1d9c0e5-3a48-4f0e-9b87-2d6e4a1b5c92', firstName: 'Aisha', lastName: 'Hassan', gender: 'female', dateOfBirth: '1993-11-02', email: 'aisha.hassan@gmail.com', nationalId: '784199311024412',
      address: { street: 'Sheikh Zayed Rd', area: 'Yas Island', city: 'Abu Dhabi', country: 'AE', geo: { lat: 24.4672, lng: 54.6037 } },
      phones: [ { label: 'mobile', number: '+971-55-998-2310', primary: true } ],
      tags: ['marketing'], createdAt: '2025-09-22T14:02:51Z' },
    { id: '7c3a8f1d-92e4-4b6a-a0f3-5e1c7d9b2a48', firstName: 'Omar', lastName: 'Khoury', gender: 'male', dateOfBirth: '1981-07-29', email: 'omar.khoury@outlook.com', nationalId: '784198107293311',
      address: { street: 'Al Maryah Island Blvd', area: 'Al Maryah', city: 'Abu Dhabi', country: 'AE', geo: { lat: 24.5005, lng: 54.3839 } },
      phones: [ { label: 'mobile', number: '+971-52-441-7099', primary: true }, { label: 'home', number: '+971-2-555-0103', primary: false } ],
      tags: ['gov'], createdAt: '2025-10-04T18:31:09Z' },
    { id: '2e4d6f8a-1c3b-4d5e-8f9a-0b2c4d6e8f1a', firstName: 'Fatima', lastName: 'Saleh', gender: 'female', dateOfBirth: '1999-01-18', email: 'fatima.saleh@yahoo.com', nationalId: '784199901183902',
      address: { street: 'Saadiyat Beach', area: 'Saadiyat', city: 'Abu Dhabi', country: 'AE', geo: { lat: 24.5407, lng: 54.4313 } },
      phones: [ { label: 'mobile', number: '+971-50-873-6612', primary: true } ],
      tags: [], createdAt: '2026-01-11T07:48:33Z' },
    { id: '9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d', firstName: 'Yousef', lastName: 'Bin Zayed', gender: 'male', dateOfBirth: '1975-04-22', email: 'yousef.bin-zayed@gmail.com', nationalId: '784197504222001',
      address: { street: 'Corniche Rd', area: 'Reem Island', city: 'Abu Dhabi', country: 'AE', geo: { lat: 24.4815, lng: 54.3680 } },
      phones: [ { label: 'work', number: '+971-58-220-5544', primary: true } ],
      tags: ['vip'], createdAt: '2025-06-30T11:25:17Z' },
    { id: '3b5d7f9a-2c4e-6a8b-0d1f-3e5a7c9b1d4f', firstName: 'Layla', lastName: 'Nazir', gender: 'female', dateOfBirth: '1990-09-08', email: 'layla.nazir@mirage.dev', nationalId: '784199009088823',
      address: { street: 'Hudayriyat Marine', area: 'Yas Island', city: 'Abu Dhabi', country: 'AE', geo: { lat: 24.4838, lng: 54.6072 } },
      phones: [ { label: 'mobile', number: '+971-50-334-9981', primary: true }, { label: 'home', number: '+971-2-661-4422', primary: false } ],
      tags: ['eng','beta'], createdAt: '2025-11-19T16:09:44Z' },
    { id: 'e8f7a6b5-c4d3-2b1a-0f9e-8d7c6b5a4f3e', firstName: 'Rashid', lastName: 'Al-Hashimi', gender: 'male', dateOfBirth: '1988-12-30', email: 'rashid.al-hashimi@gmail.com', nationalId: '784198812303011',
      address: { street: 'Al Bateen', area: 'Reem Island', city: 'Abu Dhabi', country: 'AE', geo: { lat: 24.4521, lng: 54.3389 } },
      phones: [ { label: 'mobile', number: '+971-55-112-3033', primary: true } ],
      tags: [], createdAt: '2025-12-03T08:55:21Z' },
    { id: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d', firstName: 'Maryam', lastName: 'Qasim', gender: 'female', dateOfBirth: '2001-05-11', email: 'maryam.qasim@yahoo.com', nationalId: '784200105111144',
      address: { street: 'Yas Marina', area: 'Yas Island', city: 'Abu Dhabi', country: 'AE', geo: { lat: 24.4675, lng: 54.6037 } },
      phones: [ { label: 'mobile', number: '+971-52-887-0019', primary: true } ],
      tags: ['student'], createdAt: '2026-02-28T13:17:50Z' },
  ],
  mobile: [
    { id: 'm1a2b3c4-d5e6-f7a8-9b0c-1d2e3f4a5b6c', number: '+971-50-123-4477', carrier: 'Etisalat', verified: true,  personId: '4f2e9c3a-7d11-4a89-8b1c-91e6a0d3f8c1' },
    { id: 'm2b3c4d5-e6f7-a8b9-0c1d-2e3f4a5b6c7d', number: '+971-55-998-2310', carrier: 'du',       verified: true,  personId: 'b1d9c0e5-3a48-4f0e-9b87-2d6e4a1b5c92' },
    { id: 'm3c4d5e6-f7a8-b9c0-1d2e-3f4a5b6c7d8e', number: '+971-52-441-7099', carrier: 'Etisalat', verified: false, personId: '7c3a8f1d-92e4-4b6a-a0f3-5e1c7d9b2a48' },
    { id: 'm4d5e6f7-a8b9-c0d1-2e3f-4a5b6c7d8e9f', number: '+971-50-873-6612', carrier: 'du',       verified: true,  personId: '2e4d6f8a-1c3b-4d5e-8f9a-0b2c4d6e8f1a' },
    { id: 'm5e6f7a8-b9c0-d1e2-3f4a-5b6c7d8e9f0a', number: '+971-58-220-5544', carrier: 'Virgin',   verified: true,  personId: '9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d' },
    { id: 'm6f7a8b9-c0d1-e2f3-4a5b-6c7d8e9f0a1b', number: '+971-50-334-9981', carrier: 'Etisalat', verified: true,  personId: '3b5d7f9a-2c4e-6a8b-0d1f-3e5a7c9b1d4f' },
    { id: 'm7a8b9c0-d1e2-f3a4-5b6c-7d8e9f0a1b2c', number: '+971-55-112-3033', carrier: 'du',       verified: false, personId: 'e8f7a6b5-c4d3-2b1a-0f9e-8d7c6b5a4f3e' },
    { id: 'm8b9c0d1-e2f3-a4b5-6c7d-8e9f0a1b2c3d', number: '+971-52-887-0019', carrier: 'Etisalat', verified: true,  personId: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d' },
    { id: 'm9c0d1e2-f3a4-b5c6-7d8e-9f0a1b2c3d4e', number: '+971-50-665-4422', carrier: 'du',       verified: true,  personId: '6f8e0d2c-4b6a-8c0e-2f4d-6a8c0e2f4d6a' },
  ],
  'driving-licence': [
    { licenceNumber: 'dl1a2b3c4-d5e6-f7a8-9b0c-1d2e3f4a5b6c', class: 'B', issueDate: '2019-03-12', expiryDate: '2029-03-11', personId: '4f2e9c3a-7d11-4a89-8b1c-91e6a0d3f8c1', mobileNumber: '+971-50-123-4477' },
    { licenceNumber: 'dl2b3c4d5-e6f7-a8b9-0c1d-2e3f4a5b6c7d', class: 'B', issueDate: '2022-06-08', expiryDate: '2032-06-07', personId: 'b1d9c0e5-3a48-4f0e-9b87-2d6e4a1b5c92', mobileNumber: '+971-55-998-2310' },
    { licenceNumber: 'dl3c4d5e6-f7a8-b9c0-1d2e-3f4a5b6c7d8e', class: 'C', issueDate: '2017-11-22', expiryDate: '2027-11-21', personId: '7c3a8f1d-92e4-4b6a-a0f3-5e1c7d9b2a48', mobileNumber: '+971-52-441-7099' },
    { licenceNumber: 'dl4d5e6f7-a8b9-c0d1-2e3f-4a5b6c7d8e9f', class: 'B', issueDate: '2023-01-30', expiryDate: '2033-01-29', personId: '2e4d6f8a-1c3b-4d5e-8f9a-0b2c4d6e8f1a', mobileNumber: '+971-50-873-6612' },
    { licenceNumber: 'dl5e6f7a8-b9c0-d1e2-3f4a-5b6c7d8e9f0a', class: 'D', issueDate: '2015-08-04', expiryDate: '2025-08-03', personId: '9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d', mobileNumber: '+971-58-220-5544' },
    { licenceNumber: 'dl6f7a8b9-c0d1-e2f3-4a5b-6c7d8e9f0a1b', class: 'A', issueDate: '2020-09-19', expiryDate: '2030-09-18', personId: '3b5d7f9a-2c4e-6a8b-0d1f-3e5a7c9b1d4f', mobileNumber: '+971-50-334-9981' },
    { licenceNumber: 'dl7a8b9c0-d1e2-f3a4-5b6c-7d8e9f0a1b2c', class: 'B', issueDate: '2018-04-26', expiryDate: '2028-04-25', personId: 'e8f7a6b5-c4d3-2b1a-0f9e-8d7c6b5a4f3e', mobileNumber: '+971-55-112-3033' },
    { licenceNumber: 'dl8b9c0d1-e2f3-a4b5-6c7d-8e9f0a1b2c3d', class: 'B', issueDate: '2024-02-14', expiryDate: '2034-02-13', personId: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d', mobileNumber: '+971-52-887-0019' },
  ],
};

const HISTORY = [
  { id: 'run_01HXK', when: '12 min ago', who: 'pathik.devani', counts: { person: 50000, mobile: 50000, 'driving-licence': 30000 }, status: 'completed', duration: '4.2s', size: '18.4 MB' },
  { id: 'run_01HXJ', when: '38 min ago', who: 'pathik.devani', counts: { person: 1000, mobile: 1000, 'driving-licence': 800 }, status: 'completed', duration: '0.21s', size: '412 KB' },
  { id: 'run_01HXH', when: '2 hr ago',   who: 'ci-pipeline',   counts: { person: 250000 }, status: 'completed', duration: '11.7s', size: '62.1 MB' },
  { id: 'run_01HXG', when: '5 hr ago',   who: 'pathik.devani', counts: { person: 100, mobile: 100 }, status: 'failed', duration: '\u2014', size: '\u2014', error: 'Circular dependency detected' },
  { id: 'run_01HXF', when: 'Yesterday',  who: 'ci-pipeline',   counts: { person: 50000, mobile: 50000, 'driving-licence': 30000 }, status: 'completed', duration: '4.0s', size: '18.4 MB' },
  { id: 'run_01HXE', when: '2 days ago', who: 'sarah.j',       counts: { person: 10000 }, status: 'completed', duration: '0.9s', size: '3.7 MB' },
];

const FAKER_GROUPS = [
  { ns: 'person', methods: ['firstName', 'lastName', 'fullName', 'sex', 'jobTitle', 'middleName', 'bio'] },
  { ns: 'internet', methods: ['email', 'url', 'ipv4', 'userAgent', 'mac', 'domainName', 'username'] },
  { ns: 'string', methods: ['uuid', 'numeric', 'alpha', 'alphanumeric', 'nanoid', 'hexadecimal'] },
  { ns: 'phone', methods: ['number', 'imei'] },
  { ns: 'date', methods: ['past', 'future', 'birthdate', 'recent', 'soon', 'between'] },
  { ns: 'location', methods: ['city', 'country', 'streetAddress', 'zipCode', 'latitude', 'longitude'] },
  { ns: 'helpers', methods: ['arrayElement', 'slugify', 'replaceSymbols', 'fromRegExp'] },
  { ns: 'finance', methods: ['accountNumber', 'iban', 'currency', 'amount', 'creditCardNumber'] },
  { ns: 'datatype', methods: ['boolean', 'json'] },
  { ns: 'lorem', methods: ['word', 'words', 'sentence', 'paragraph'] },
];

Object.assign(window, { SCHEMAS, TOPO_ORDER, ROWS, HISTORY, FAKER_GROUPS });



function PaneSchemas({ activeId, setActiveId, onCreate }) {
  return (
    <div className="pane pane-schemas">
      <div className="pane-head">
        <h2>Schemas</h2>
        <span className="count">{SCHEMAS.length}</span>
      </div>
      <div className="pane-search">
        <div className="input-group">
          <span className="input-affix"><MIcon name="search" size={14} /></span>
          <input className="input sm" placeholder="Search…" />
        </div>
      </div>
      <div className="schema-list">
        {SCHEMAS.map((s) => {
          const refCount = s.properties.filter(p => p.isRef).length;
          return (
            <div key={s.id} className={'schema-card ' + (activeId === s.id ? 'active' : '')} onClick={() => setActiveId(s.id)}>
              <div className={'icon ' + s.color}><MIcon name={s.icon} size={16} /></div>
              <div>
                <div className="nm">{s.title}</div>
                <div className="id">{s.id}</div>
              </div>
              <div className="ct">{s.properties.length}p{refCount ? ' · ' + refCount + '↗' : ''}</div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '8px 12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={onCreate}>
          <MIcon name="plus" size={14} /> Create schema
        </button>
        <button className="btn btn-sm" style={{ width: '100%', color: 'hsl(var(--muted-foreground))' }}>
          <MIcon name="upload" size={14} /> Import JSON schema
        </button>
      </div>
    </div>
  );
}

function collectDeps(prop) {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') {
      if (typeof v.$ref === 'string') {
        if (v.$ref.startsWith('#/properties/')) out.push({ scope: 'local', field: v.$ref.replace('#/properties/', '') });
        else { const m = v.$ref.match(/^#\/schema\/([^/]+)\/(.+)$/); if (m) out.push({ scope: 'remote', schemaId: m[1], field: m[2] }); }
      }
      Object.values(v).forEach(walk);
    }
  };
  walk(prop.faker?.args);
  return out;
}

function FakerPill({ prop }) {
  const f = prop.faker || {};
  if (prop.isRef) {
    const ref = f.args?.[0]?.$ref;
    const m = ref?.match(/^#\/schema\/([^/]+)\/(.+)$/);
    return <span className="faker-pill ref"><MIcon name="link" size={11} />{m ? <>schema · <b>{m[1]}</b>.<b>{m[2]}</b></> : ref}</span>;
  }
  if (!f.method) return <span className="faker-pill empty">no faker</span>;
  const [ns, m] = f.method.split('.');
  return <span className="faker-pill"><span className="ns">{ns}</span><span className="dot">·</span><span>{m}</span>{f.args && <span style={{ color: 'hsl(var(--muted-foreground))' }}>({summarizeArgs(f.args)})</span>}</span>;
}

function summarizeArgs(args) {
  if (!args || !args.length) return '';
  const a = args[0];
  if (typeof a === 'string') return '"' + a + '"';
  if (typeof a === 'number' || typeof a === 'boolean') return String(a);
  if (Array.isArray(a)) return '[' + a.length + ']';
  if (a && typeof a === 'object') {
    const keys = Object.keys(a);
    return keys.slice(0, 2).join(', ') + (keys.length > 2 ? '…' : '');
  }
  return '';
}

function PropRowS({ prop, active, onClick, depth = 0, isContainer, expanded, onToggle, isArrayItem, indent = 0 }) {
  const deps = collectDeps(prop);
  const displayName = isArrayItem
    ? <span className="items-marker"><MIcon name="package" size={10} /> items</span>
    : <span>{prop.name || '—'}</span>;
  let typeBadge;
  if (prop.type === 'object') typeBadge = <span className="row-type-tag object"><MIcon name="braces" size={10} /> object · {(prop.fields || []).length} fields</span>;
  else if (prop.type === 'array') typeBadge = <span className="row-type-tag array"><MIcon name="package" size={10} /> array · {prop.minItems ?? 0}–{prop.maxItems ?? '∞'}</span>;
  else typeBadge = <span className="badge mono">{prop.type}{prop.format ? '\u00B7' + prop.format : ''}</span>;

  return (
    <div className={'prop-row ' + (active ? 'active' : '')} onClick={onClick}
         style={prop.type === 'object'
           ? { borderLeft: '3px solid hsl(var(--brand-cyan) / 0.6)' }
           : prop.type === 'array'
             ? { borderLeft: '3px solid hsl(var(--brand-amber) / 0.6)' }
             : undefined}>
      <div className="handle" onClick={(e) => { if (isContainer) { e.stopPropagation(); onToggle(); } }}
           style={{ cursor: isContainer ? 'pointer' : 'grab' }}>
        {isContainer
          ? <MIcon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
          : <MIcon name="grip" size={14} />}
      </div>
      <div className="name" style={{ paddingLeft: indent }}>
        {displayName}
        {prop.required && !isArrayItem && <span className="req">*</span>}
        {typeBadge}
        
      </div>
      <div className="faker-tag">
        {prop.type === 'object'
          ? <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>nested fields…</span>
          : prop.type === 'array'
            ? <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>items → {prop.items?.type || 'string'}</span>
            : <FakerPill prop={prop} />}
        {deps.length > 0 && <span className="badge violet"><MIcon name="link" size={10} /> {deps.length} dep</span>}
      </div>
      <div className="actions"><MIcon name="chevron-right" size={14} /></div>
    </div>
  );
}

function PropTree({ items, depth, basePath, expanded, toggle, activePath, setActivePath, asArrayItem }) {
  return (
    <>
      {items.map((p, idx) => {
        const isArrayItem = !!asArrayItem;
        const key = isArrayItem ? 'items' : (p.name || ('items' + idx));
        const path = basePath ? basePath + (isArrayItem ? '' : '.' + key) : key;
        const isContainer = p.type === 'object' || p.type === 'array';
        const isOpen = expanded[path] !== false; // default-open
        return (
          <React.Fragment key={path}>
            <PropRowS
              prop={p}
              active={activePath === path}
              onClick={() => setActivePath(path)}
              depth={depth}
              indent={depth * 18}
              isContainer={isContainer}
              expanded={isOpen}
              onToggle={() => toggle(path)}
              isArrayItem={isArrayItem}
            />
            {isContainer && isOpen && p.type === 'object' && (
              <PropTree items={p.fields || []} depth={depth + 1} basePath={path + '.fields'} expanded={expanded} toggle={toggle} activePath={activePath} setActivePath={setActivePath} />
            )}
            {isContainer && isOpen && p.type === 'array' && p.items && (
              <PropTree items={[p.items]} depth={depth + 1} basePath={path + '.items'} expanded={expanded} toggle={toggle} activePath={activePath} setActivePath={setActivePath} asArrayItem />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

// Walk to find a prop by path string built by PropTree
function findPropByPath(properties, path) {
  if (!path) return null;
  const parts = path.split('.');
  let list = properties;
  let prop = null;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (seg === 'fields') continue;
    if (seg === 'items') {
      prop = prop && prop.items ? prop.items : null;
      list = prop ? [prop] : [];
      continue;
    }
    const idxMatch = seg.match(/^items(\d+)$/);
    if (idxMatch) {
      // anonymous item (shouldn't occur in this dataset but keep safe)
      prop = list[Number(idxMatch[1])] || null;
    } else {
      prop = list.find(x => x.name === seg) || null;
    }
    if (!prop) return null;
    list = prop.type === 'object' ? (prop.fields || []) : prop.type === 'array' && prop.items ? [prop.items] : [];
  }
  return prop;
}

function countTreeStats(props) {
  let total = 0, req = 0, refs = 0, maxDepth = 0;
  const walk = (rs, d) => {
    maxDepth = Math.max(maxDepth, d);
    rs.forEach(r => {
      total++; if (r.required) req++;
      if (r.isRef) refs++;
      if (r.type === 'object' && r.fields) walk(r.fields, d + 1);
      if (r.type === 'array' && r.items) walk([r.items], d + 1);
    });
  };
  walk(props, 0);
  return { total, req, refs, maxDepth };
}

function ArgNode({ value, depth = 0, fieldKey }) {
  const indent = { paddingLeft: depth * 12 };
  if (value === null) return <div style={indent}><span className="v-null">null</span></div>;
  if (typeof value === 'string') return <div style={indent}><span className="v-string">"{value}"</span></div>;
  if (typeof value === 'number' || typeof value === 'boolean') return <div style={indent}><span className="v-num">{String(value)}</span></div>;
  if (Array.isArray(value)) {
    return (
      <div style={indent}>
        <span style={{ color: 'hsl(var(--muted-foreground))' }}>{'['}</span>
        {value.slice(0, 4).map((v, i) => <ArgNode key={i} value={v} depth={depth + 1} />)}
        {value.length > 4 && <div style={{ paddingLeft: (depth + 1) * 12, color: 'hsl(var(--muted-foreground))' }}>…{value.length - 4} more</div>}
        <span style={{ color: 'hsl(var(--muted-foreground))' }}>{']'}</span>
      </div>
    );
  }
  if (value && typeof value === 'object') {
    if (value.$ref) {
      const ref = value.$ref;
      const isLocal = ref.startsWith('#/properties/');
      const m = ref.match(/^#\/schema\/([^/]+)\/(.+)$/);
      if (isLocal) {
        const field = ref.replace('#/properties/', '');
        return <div className="arg-row" style={indent}>{fieldKey && <span className="k">{fieldKey}:</span>}<span className="ref-chip"><MIcon name="link" size={10} /> local · <b>{field}</b></span><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>same schema</span></div>;
      } else if (m) {
        return <div className="arg-row" style={indent}>{fieldKey && <span className="k">{fieldKey}:</span>}<span className="ref-chip"><MIcon name="link" size={10} /> schema · <b>{m[1]}</b>.<b>{m[2]}</b></span><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>cross-schema</span></div>;
      }
      return <div style={indent}><span className="ref-chip">{ref}</span></div>;
    }
    return (
      <div style={indent}>
        <span style={{ color: 'hsl(var(--muted-foreground))' }}>{'{'}</span>
        {Object.entries(value).map(([k, v]) => (<ArgNode key={k} value={v} depth={depth + 1} fieldKey={k} />))}
        <span style={{ color: 'hsl(var(--muted-foreground))' }}>{'}'}</span>
      </div>
    );
  }
  return null;
}

function getSampleByPath(schema, path) {
  const row = ROWS[schema.id]?.[0];
  if (!row || !path) return undefined;
  const parts = path.split('.');
  let cur = row;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (seg === 'fields') continue;
    if (seg === 'items') {
      // For array items, sample the first item if present
      if (Array.isArray(cur)) { cur = cur[0]; }
      continue;
    }
    if (cur == null) return undefined;
    if (Array.isArray(cur)) { cur = cur[0]; if (!cur) return undefined; }
    cur = cur[seg];
  }
  return cur;
}

function PropDetail({ schema, prop, activePath }) {
  if (!prop) return null;
  // Container types get a different detail view
  if (prop.type === 'object' || prop.type === 'array') {
    return <ContainerDetail schema={schema} prop={prop} activePath={activePath} />;
  }
  const deps = collectDeps(prop);
  const sample = activePath ? getSampleByPath(schema, activePath) : ROWS[schema.id]?.[0]?.[prop.name];
  const method = prop.faker?.method;
  const [ns, m] = (method || '').split('.');
  return (
    <div className="prop-detail">
      <div className="pd-head">
        <div className="left">
          <span className="title">{prop.name}</span>
          {prop.required && <span className="badge rose">required</span>}
          <span className="badge mono">{prop.type}{prop.format ? ' · ' + prop.format : ''}</span>
          {prop.isRef && <span className="badge violet"><MIcon name="link" size={10} /> reference</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-ghost"><MIcon name="copy" size={14} /> Duplicate</button>
          <button className="btn btn-sm btn-ghost" style={{ color: 'hsl(var(--destructive))' }}><MIcon name="trash" size={14} /> Remove</button>
        </div>
      </div>
      <div className="grid">
        <div>
          <label className="lbl">Faker method</label>
          <div className="method-picker">
            <span className="ns">{ns || 'select'}</span>
            <span className="meth">{m ? '.' + m : '— pick a method'}</span>
            <span className="chev"><MIcon name="chevrons-up-down" size={14} /></span>
          </div>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 6 }}>Pick from 2,300+ <span className="mono">@faker-js/faker</span> methods.</div>
        </div>
        <div>
          <label className="lbl">Arguments</label>
          <div className="args-editor">
            {!prop.faker?.args || prop.faker.args.length === 0
              ? <div className="arg-empty">No arguments — called with no parameters</div>
              : (<>
                <span style={{ color: 'hsl(var(--muted-foreground))' }}>{'['}</span>
                {prop.faker.args.map((a, i) => <ArgNode key={i} value={a} depth={1} />)}
                <span style={{ color: 'hsl(var(--muted-foreground))' }}>{']'}</span>
              </>)}
          </div>
        </div>
        <div className="full">
          <div className="sample-card">
            <div className="row">
              <span className="lbl">Sample value</span>
              <button className="reroll"><MIcon name="dice" size={12} /> Re-roll</button>
            </div>
            <div className="val">{sample === undefined ? '—' : String(sample)}</div>
          </div>
        </div>
      </div>
      {deps.length > 0 && (
        <div className="dep-card">
          <MIcon name="link" size={16} />
          <div className="body">
            <div className="ti">Resolves with referential integrity</div>
            <div className="sub">Mirage topologically sorts these so every row references a real upstream value.</div>
            <div className="deps">
              {deps.map((d, i) => (
                <span key={i} className="badge violet mono" style={{ borderRadius: 4 }}>
                  {d.scope === 'local' ? <><b>{schema.id}</b>.{d.field}</> : <><b>{d.schemaId}</b>.{d.field}</>}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function ContainerDetail({ schema, prop, activePath }) {
  const isArr = prop.type === 'array';
  const fields = isArr ? (prop.items?.type === 'object' ? (prop.items.fields || []) : []) : (prop.fields || []);
  const sample = activePath ? getSampleByPath(schema, activePath) : undefined;
  return (
    <div className="prop-detail">
      <div className="pd-head">
        <div className="left">
          <span className="title">{prop.name || (isArr ? 'items' : '—')}</span>
          {prop.required && <span className="badge rose">required</span>}
          <span className={'row-type-tag ' + prop.type}>
            <MIcon name={isArr ? 'package' : 'braces'} size={10} /> {prop.type}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-ghost"><MIcon name="plus" size={14} /> Add {isArr ? 'items schema' : 'field'}</button>
          <button className="btn btn-sm btn-ghost"><MIcon name="copy" size={14} /> Duplicate</button>
          <button className="btn btn-sm btn-ghost" style={{ color: 'hsl(var(--destructive))' }}><MIcon name="trash" size={14} /> Remove</button>
        </div>
      </div>

      {isArr && (
        <div className="grid" style={{ marginBottom: 16 }}>
          <div>
            <label className="lbl">Min items</label>
            <input className="input mono" defaultValue={prop.minItems ?? 0} />
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 6 }}>Minimum length of the generated array.</div>
          </div>
          <div>
            <label className="lbl">Max items</label>
            <input className="input mono" defaultValue={prop.maxItems ?? 10} />
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 6 }}>Upper bound. Random length is drawn between min and max.</div>
          </div>
          <div className="full">
            <label className="lbl">Length distribution</label>
            <div className="tabs" style={{ marginTop: 4 }}>
              <button className="tab active">Uniform</button>
              <button className="tab">Weighted</button>
              <button className="tab">Fixed</button>
              <button className="tab">Custom fn</button>
            </div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 6 }}>Picks an array length per row according to the chosen distribution.</div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, background: 'hsl(var(--background))' }}>
        <div className="card-header" style={{ padding: '10px 14px' }}>
          <h3 style={{ fontSize: 13 }}>{isArr ? 'Items schema' : 'Nested fields'}</h3>
          <span className="badge mono">{isArr
            ? (prop.items?.type === 'object' ? (prop.items.fields || []).length + ' fields' : prop.items?.type || 'string')
            : fields.length + ' fields'}</span>
        </div>
        <div>
          {isArr && prop.items?.type !== 'object' && (
            <div className="dist-row" style={{ gridTemplateColumns: 'auto 1fr auto', padding: '10px 14px' }}>
              <span className="items-marker"><MIcon name="package" size={10} /> items</span>
              <span className="mono" style={{ fontSize: 13 }}>{prop.items?.type || 'string'}</span>
              {prop.items?.faker?.method && <FakerPill prop={prop.items} />}
            </div>
          )}
          {fields.map((f) => (
            <div key={f.name} className="dist-row" style={{ gridTemplateColumns: '14px 1fr 1fr auto', padding: '8px 14px' }}>
              <span style={{ color: 'hsl(var(--muted-foreground))' }}><MIcon name="chevron-right" size={12} /></span>
              <span className="mono" style={{ fontSize: 13 }}>
                {f.name}{f.required && <span style={{ color: 'hsl(var(--destructive))' }}>*</span>}
                {f.type === 'object' && <span className="row-type-tag object" style={{ marginLeft: 6 }}><MIcon name="braces" size={9} /> object</span>}
                {f.type === 'array' && <span className="row-type-tag array" style={{ marginLeft: 6 }}><MIcon name="package" size={9} /> array</span>}
                {f.type !== 'object' && f.type !== 'array' && <span className="badge mono" style={{ marginLeft: 6 }}>{f.type}{f.format ? '·' + f.format : ''}</span>}
              </span>
              <span>
                {f.type === 'object' || f.type === 'array'
                  ? <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>{f.type === 'object' ? (f.fields || []).length + ' nested fields…' : 'items → ' + (f.items?.type || 'string')}</span>
                  : <FakerPill prop={f} />}
              </span>
              <span style={{ color: 'hsl(var(--muted-foreground))' }}><MIcon name="chevron-right" size={12} /></span>
            </div>
          ))}
        </div>
      </div>

      <div className="sample-card" style={{ marginTop: 16 }}>
        <div className="row">
          <span className="lbl">Sample value</span>
          <button className="reroll"><MIcon name="dice" size={12} /> Re-roll</button>
        </div>
        <pre style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{sample === undefined ? '—' : JSON.stringify(sample, null, 2)}</pre>
      </div>
    </div>
  );
}

function PanePreview({ schema, rowIdx, setRowIdx }) {
  const rows = ROWS[schema.id] || [];
  const total = rows.length;
  const row = rows[rowIdx % Math.max(total, 1)] || {};
  return (
    <div className="pane pane-preview">
      <div className="preview-head">
        <span className="lbl">Live preview</span>
        <span className="badge mono"><MIcon name="dice" size={11} /> seed 42</span>
      </div>
      <div className="preview-tabs">
        <div className="tabs">
          <button className="tab active"><MIcon name="braces" size={12} /> JSON</button>
          <button className="tab"><MIcon name="table" size={12} /> Table</button>
          <button className="tab"><MIcon name="file-text" size={12} /> Schema</button>
        </div>
      </div>
      <div className="preview-json">
        <RenderRow row={row} schema={schema} />
        <span className="row-sep">— row {rowIdx + 1} / {total} —</span>
        <RenderRow row={rows[(rowIdx + 1) % total] || {}} schema={schema} muted />
      </div>
      <div className="preview-footer">
        <span>row <span className="mono">{rowIdx + 1}</span> / <span className="mono">{total}</span></span>
        <div className="row-nav">
          <button onClick={() => setRowIdx((rowIdx - 1 + total) % total)}><MIcon name="chevron-left" size={14} /></button>
          <button onClick={() => setRowIdx((rowIdx + 1) % total)}><MIcon name="chevron-right" size={14} /></button>
          <button><MIcon name="dice" size={14} /></button>
        </div>
      </div>
    </div>
  );
}

function RenderRow({ row, schema, muted }) {
  const entries = Object.entries(row);
  return (
    <div style={{ opacity: muted ? 0.5 : 1 }}>
      <span className="p">{'{'}</span>
      {entries.map(([k, v], i) => {
        const prop = schema.properties.find((p) => p.name === k);
        const isRef = prop?.isRef;
        return (
          <div key={k}>
            {'  '}<span className="k">"{k}"</span><span className="p">: </span>{renderJsonVal(v, isRef, 1)}{i < entries.length - 1 && <span className="p">,</span>}
          </div>
        );
      })}
      <span className="p">{'}'}</span>
    </div>
  );
}

function renderJsonVal(v, isRef, indent = 0) {
  if (v === null) return <span className="nul">null</span>;
  if (typeof v === 'boolean') return <span className="b">{String(v)}</span>;
  if (typeof v === 'number') return <span className="n">{String(v)}</span>;
  if (typeof v === 'string') return <span className={isRef ? 'ref' : 's'}>"{v}"</span>;
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="p">[]</span>;
    const pad = '  '.repeat(indent + 1);
    return (
      <>
        <span className="p">[</span>
        {v.map((item, i) => (
          <div key={i}>{pad}{renderJsonVal(item, false, indent + 1)}{i < v.length - 1 ? <span className="p">,</span> : null}</div>
        ))}
        <div>{'  '.repeat(indent)}<span className="p">]</span></div>
      </>
    );
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v);
    if (entries.length === 0) return <span className="p">{'{}'}</span>;
    const pad = '  '.repeat(indent + 1);
    return (
      <>
        <span className="p">{'{'}</span>
        {entries.map(([k, val], i) => (
          <div key={k}>{pad}<span className="k">"{k}"</span><span className="p">: </span>{renderJsonVal(val, false, indent + 1)}{i < entries.length - 1 ? <span className="p">,</span> : null}</div>
        ))}
        <div>{'  '.repeat(indent)}<span className="p">{'}'}</span></div>
      </>
    );
  }
  return <span className="p">{JSON.stringify(v)}</span>;
}

function SchemasPage({ onCreate }) {
  const [activeId, setActiveId] = React.useState('person');
  const schema = SCHEMAS.find((s) => s.id === activeId);
  const [activePath, setActivePath] = React.useState('email');
  const [rowIdx, setRowIdx] = React.useState(0);
  const [expanded, setExpanded] = React.useState({});
  const toggle = (path) => setExpanded((e) => ({ ...e, [path]: e[path] === false ? true : false }));

  React.useEffect(() => {
    const refProp = schema.properties.find((p) => p.isRef) || schema.properties.find((p) => p.name === 'email') || schema.properties[0];
    setActivePath(refProp?.name || schema.properties[0].name);
    setRowIdx(0);
    // Default-expand all containers in this schema
    const next = {};
    const walk = (rs, base) => rs.forEach(p => {
      const path = base ? base + '.' + p.name : p.name;
      if (p.type === 'object') { next[path] = true; walk(p.fields || [], path + '.fields'); }
      if (p.type === 'array' && p.items) { next[path] = true; walk([p.items], path + '.items'); }
    });
    walk(schema.properties, '');
    setExpanded(next);
  }, [activeId]);

  const prop = findPropByPath(schema.properties, activePath) || schema.properties[0];
  const stats = countTreeStats(schema.properties);

  return (
    <div className="editor" data-screen-label="Schemas">
      <PaneSchemas activeId={activeId} setActiveId={setActiveId} onCreate={onCreate} />
      <div className="pane pane-edit">
        <div className="editor-toolbar">
          <div className="title-block">
            <div className={'icon ' + schema.color} style={{ width: 28, height: 28, borderRadius: 6, color: 'white', background: 'hsl(var(--brand-' + schema.color + '))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MIcon name={schema.icon} size={14} />
            </div>
            <h2>{schema.title}</h2>
            <span className="badge mono">{schema.id}</span>
          </div>
          <div className="spacer" />
          <span className="desc" style={{ maxWidth: 360 }}>{schema.description}</span>
          <button className="btn btn-sm btn-ghost"><MIcon name="braces" size={14} /> JSON</button>
          <button className="btn btn-sm btn-ghost"><MIcon name="copy" size={14} /> Duplicate</button>
          <button className="btn btn-sm btn-primary"><MIcon name="play" size={14} /> Generate</button>
        </div>
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
            <b style={{ color: 'hsl(var(--foreground))' }}>{stats.total}</b> fields · <b style={{ color: 'hsl(var(--foreground))' }}>{stats.req}</b> required · <b style={{ color: 'hsl(var(--foreground))' }}>{stats.refs}</b> references · max depth <b style={{ color: 'hsl(var(--foreground))' }}>{stats.maxDepth + 1}</b>
          </div>
          <div style={{ flex: 1 }} />
          <div className="tabs"><button className="tab active">Properties</button><button className="tab">Indexes</button><button className="tab">Validators</button></div>
        </div>
        <div className="prop-list">
          <PropTree items={schema.properties} depth={0} basePath="" expanded={expanded} toggle={toggle} activePath={activePath} setActivePath={setActivePath} />
          <button className="btn btn-sm" style={{ alignSelf: 'stretch', justifyContent: 'center', borderStyle: 'dashed', color: 'hsl(var(--muted-foreground))', height: 36 }}><MIcon name="plus" size={14} /> Add property</button>
        </div>
        <PropDetail schema={schema} prop={prop} activePath={activePath} />
        <div style={{ height: 24 }} />
      </div>
      <PanePreview schema={schema} rowIdx={rowIdx} setRowIdx={setRowIdx} />
    </div>
  );
}

Object.assign(window, { SchemasPage });



let __propIdCounter = 1000;
const nextPropId = () => ++__propIdCounter;
function makeProp(name, type, faker) {
  const p = { id: nextPropId(), name: name || 'newField', type: type || 'string', format: '', required: false, faker: faker || '', expanded: true };
  if (p.type === 'object') p.fields = [];
  if (p.type === 'array')  p.items = { id: nextPropId(), name: '', type: 'string', format: '', required: false, faker: '', expanded: true };
  return p;
}
function changePropType(p, newType) {
  const out = { ...p, type: newType, format: '' };
  // Clear faker on container types
  if (newType === 'object' || newType === 'array') out.faker = '';
  if (newType === 'object') {
    out.fields = p.fields && p.fields.length ? p.fields : [];
    delete out.items;
  } else if (newType === 'array') {
    out.items = p.items || { id: nextPropId(), name: '', type: 'string', format: '', required: false, faker: '', expanded: true };
    delete out.fields;
  } else {
    delete out.fields;
    delete out.items;
  }
  return out;
}

function Step1({ name, setName, id, description, setDescription, color, setColor, icon, setIcon, tagsInput, setTagsInput }) {
  const icons = ['home', 'briefcase', 'mail', 'phone', 'id-card', 'globe', 'tag', 'package', 'key', 'database', 'user'];
  const colors = ['violet', 'cyan', 'emerald', 'amber', 'rose', 'slate'];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Schema name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Address" />
          <div className="helper">Human-readable title shown in the UI.</div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label><span className="mono">$id</span></label>
          <div className="input-group">
            <span className="input-affix">#/schema/</span>
            <input className="input mono" value={id} readOnly />
          </div>
          <div className="helper">Auto-generated from the schema name. Used in <span className="mono">$ref</span> paths.</div>
        </div>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label>Description</label>
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Color</label>
          <div className="color-swatch-row">
            {colors.map((c) => (<div key={c} className={'color-swatch ' + c + (color === c ? ' selected' : '')} onClick={() => setColor(c)} />))}
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Icon</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {icons.map((i) => (
              <button key={i} className="btn btn-sm btn-icon"
                style={{ borderColor: icon === i ? 'hsl(var(--foreground))' : 'hsl(var(--border))', background: icon === i ? 'hsl(var(--accent))' : 'hsl(var(--background))' }}
                onClick={() => setIcon(i)}><MIcon name={i} size={14} /></button>
            ))}
          </div>
        </div>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label>Tags <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}>(optional)</span></label>
        <input className="input" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="pii, geo, internal" />
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tagsInput.split(',').map(t => t.trim()).filter(Boolean).map((t) => (<span key={t} className="badge"><MIcon name="tag" size={10} /> {t}</span>))}
        </div>
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-body" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, color: 'white', background: 'hsl(var(--brand-' + color + '))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MIcon name={icon} size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong>{name || 'Untitled schema'}</strong>
              <span className="badge mono">{id || '—'}</span>
            </div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>{description || 'No description'}</div>
          </div>
          <span className="badge outline"><MIcon name="eye" size={11} /> live preview</span>
        </div>
      </div>
    </div>
  );
}



// Recursive nested-property builder
function NestedBuilder({ rows, setRows, depth, parentKind, schemaId }) {
  const [pickerOpen, setPickerOpen] = React.useState(null);
  const updateRow = (id, patch) => setRows(rows.map(r => r.id === id ? (typeof patch === 'function' ? patch(r) : { ...r, ...patch }) : r));
  const removeRow = (id) => setRows(rows.filter(r => r.id !== id));
  const addRow = () => setRows([...rows, makeProp('newField', 'string')]);

  return (
    <>
      {rows.map((row) => (
        <BuilderRow key={row.id}
          row={row}
          depth={depth}
          parentKind={parentKind}
          schemaId={schemaId}
          updateRow={(patch) => updateRow(row.id, patch)}
          removeRow={() => removeRow(row.id)}
          pickerOpen={pickerOpen === row.id}
          togglePicker={() => setPickerOpen(pickerOpen === row.id ? null : row.id)}
        />
      ))}
      {parentKind !== 'array' && (
        <button className="add-inline" style={{ '--indent': (depth * 24 + 12) + 'px' }} onClick={addRow}>
          <MIcon name="plus" size={12} /> Add {depth === 0 ? 'property' : 'field'}
        </button>
      )}
    </>
  );
}

function BuilderRow({ row, depth, parentKind, schemaId, updateRow, removeRow, pickerOpen, togglePicker }) {
  const isContainer = row.type === 'object' || row.type === 'array';
  const isItems = parentKind === 'array';

  const indentPx = depth * 20;
  const rowCls = 'builder-row ' + (row.type === 'object' ? 'is-object' : '') + ' ' + (row.type === 'array' ? 'is-items-arr' : '') + (isItems ? ' is-items' : '');

  return (
    <>
      <div className={rowCls}>
        <span className="drag" style={{ visibility: isItems ? 'hidden' : 'visible' }}><MIcon name="grip" size={12} /></span>
        <span>
          {isContainer ? (
            <button className={'expand-btn ' + (row.expanded ? 'open' : '')} onClick={() => updateRow({ expanded: !row.expanded })}>
              <MIcon name="chevron-right" size={12} className="chev" />
            </button>
          ) : <span style={{ display: 'inline-block', width: 18 }} />}
        </span>
        <div className="name-cell" style={{ paddingLeft: indentPx }}>
          {isItems ? (
            <span className="items-marker"><MIcon name="package" size={10} /> items</span>
          ) : (
            <input className="input sm mono" value={row.name} onChange={(e) => updateRow({ name: e.target.value })} placeholder="fieldName" />
          )}
        </div>
        <select className="select sm" value={row.type + '|' + (row.format || '')}
          onChange={(e) => { const [t, f] = e.target.value.split('|'); updateRow((r) => ({ ...changePropType(r, t), format: f })); }}>
          <option value="string|">string</option>
          <option value="string|uuid">string · uuid</option>
          <option value="string|email">string · email</option>
          <option value="string|date">string · date</option>
          <option value="string|date-time">string · date-time</option>
          <option value="number|">number</option>
          <option value="integer|">integer</option>
          <option value="boolean|">boolean</option>
          <option value="object|">object {'{}'}</option>
          <option value="array|">array []</option>
        </select>
        {isContainer ? (
          <span className={'row-type-tag ' + row.type}>
            <MIcon name={row.type === 'object' ? 'braces' : 'package'} size={10} />
            {row.type === 'object' ? ((row.fields||[]).length + ' fields') : ('items: ' + (row.items?.type || 'string'))}
          </span>
        ) : (
          <FakerCell value={row.faker} onChange={(v) => updateRow({ faker: v })} open={pickerOpen} onToggle={togglePicker} schemaId={schemaId} />
        )}
        {isItems ? <span /> : (
          <span className={'switch ' + (row.required ? 'on' : '')} title="Required" onClick={() => updateRow({ required: !row.required })} />
        )}
        {isItems ? <span /> : (
          <button className="icon-btn" onClick={removeRow} aria-label="Remove"><MIcon name="trash" size={12} /></button>
        )}
      </div>
      {isContainer && row.expanded && (
        <>
          {row.type === 'object' && (
            <NestedBuilder
              rows={row.fields || []}
              setRows={(nf) => updateRow({ fields: nf })}
              depth={depth + 1}
              parentKind="object"
              schemaId={schemaId}
            />
          )}
          {row.type === 'array' && row.items && (
            <NestedBuilder
              rows={[row.items]}
              setRows={([newItem]) => updateRow({ items: newItem })}
              depth={depth + 1}
              parentKind="array"
              schemaId={schemaId}
            />
          )}
        </>
      )}
    </>
  );
}

function FakerCell({ value, onChange, open, onToggle, schemaId }) {
  const isRef = (value || '').startsWith('$ref:');
  const ref = isRef ? value.slice(5) : '';
  const [ns, m] = (value || '').split('.');
  return (
    <div style={{ position: 'relative' }}>
      <div className="method-picker" style={{ height: 26, padding: '0 8px', fontSize: 11, gap: 6 }} onClick={onToggle}>
        {!value && <span style={{ color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>— pick a method —</span>}
        {value && isRef && (<><span className="ref-chip"><MIcon name="link" size={10} /> $ref</span><span className="meth">{ref}</span></>)}
        {value && !isRef && (<><span className="ns">{ns}</span><span className="meth">.{m}</span></>)}
        <span style={{ marginLeft: 'auto', color: 'hsl(var(--muted-foreground))' }}><MIcon name="chevrons-up-down" size={11} /></span>
      </div>
      {open && (
        <div className="dropdown" style={{ top: 30, left: 0, width: 320 }}>
          <div className="dropdown-section">References (cross-schema)</div>
          {SCHEMAS.filter(s => s.id !== schemaId).flatMap(s =>
            s.properties.filter(p => !p.isRef).slice(0, 3).map(p => (
              <div key={s.id + '.' + p.name} className="dropdown-item" onClick={() => { onChange('$ref:' + s.id + '.' + p.name); onToggle(); }}>
                <MIcon name="link" size={12} />
                <span><b className="mono">{s.id}</b><span style={{ color: 'hsl(var(--muted-foreground))' }}>.</span><span className="mono">{p.name}</span></span>
                <span className="key">{p.type}</span>
              </div>
            ))
          )}
          <div className="dropdown-section">Faker methods</div>
          {FAKER_GROUPS.slice(0, 6).flatMap(g => g.methods.slice(0, 2).map(m => (
            <div key={g.ns + '.' + m} className="dropdown-item" onClick={() => { onChange(g.ns + '.' + m); onToggle(); }}>
              <span className="badge violet mono" style={{ fontSize: 10, padding: '0 4px' }}>{g.ns}</span>
              <span className="mono">.{m}</span>
            </div>
          )))}
        </div>
      )}
    </div>
  );
}

function countAll(rows) {
  let total = 0, req = 0, refs = 0, maxDepth = 0;
  const walk = (rs, d) => {
    maxDepth = Math.max(maxDepth, d);
    rs.forEach(r => {
      total++;
      if (r.required) req++;
      if ((r.faker || '').startsWith('$ref:')) refs++;
      if (r.type === 'object' && r.fields) walk(r.fields, d + 1);
      if (r.type === 'array' && r.items) walk([r.items], d + 1);
    });
  };
  walk(rows, 0);
  return { total, req, refs, maxDepth };
}



function Step2({ rows, setRows, id }) {
  const stats = countAll(rows);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Properties</div>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
            Define the shape of each generated row. Click <span className="row-type-tag object" style={{ display: 'inline-flex' }}><MIcon name="braces" size={10} /> object</span> or <span className="row-type-tag array" style={{ display: 'inline-flex' }}><MIcon name="package" size={10} /> array</span> to nest fields any depth.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm"><MIcon name="wand" size={13} /> Infer from sample</button>
          <button className="btn btn-sm"><MIcon name="upload" size={13} /> Paste JSON</button>
        </div>
      </div>

      <div className="builder nested">
        <div className="builder-head">
          <span />
          <span />
          <span>Name</span>
          <span>Type</span>
          <span>Faker / $ref</span>
          <span>Req</span>
          <span />
        </div>
        <NestedBuilder rows={rows} setRows={setRows} depth={0} schemaId={id} />
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 12, fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
        <span><b style={{ color: 'hsl(var(--foreground))' }}>{stats.total}</b> total fields</span>
        <span>·</span>
        <span><b style={{ color: 'hsl(var(--foreground))' }}>{stats.req}</b> required</span>
        <span>·</span>
        <span><b style={{ color: 'hsl(var(--brand-violet))' }}>{stats.refs}</b> references</span>
        <span>·</span>
        <span>max depth <b style={{ color: 'hsl(var(--foreground))' }}>{stats.maxDepth + 1}</b></span>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <MIcon name="sparkles" size={18} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Nest fields freely</div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
              An <span className="mono">object</span> field can contain any properties — even more objects or arrays. An <span className="mono">array</span> field has one <b>items</b> sub-schema that defines what each element looks like.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Convert nested rows -> JSON Schema fragment
function rowToSchema(row) {
  const out = { type: row.type };
  if (row.format) out.format = row.format;
  if (row.faker && row.type !== 'object' && row.type !== 'array') {
    if (row.faker.startsWith('$ref:')) {
      const parts = row.faker.slice(5).split('.');
      out.faker = { args: [{ $ref: '#/schema/' + parts[0] + '/' + parts[1] }] };
    } else {
      out.faker = { method: row.faker };
    }
  }
  if (row.type === 'object') {
    out.properties = {};
    (row.fields || []).forEach(f => { out.properties[f.name] = rowToSchema(f); });
    const req = (row.fields || []).filter(f => f.required).map(f => f.name);
    if (req.length) out.required = req;
    out.additionalProperties = false;
  }
  if (row.type === 'array') {
    out.items = row.items ? rowToSchema(row.items) : { type: 'string' };
    out.minItems = 1;
    out.maxItems = 5;
  }
  return out;
}

function rootSchemaToJson(rows, id, title, description) {
  const root = rowToSchema({ id: 0, type: 'object', fields: rows });
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: id,
    title,
    description,
    ...root,
  };
}

function Step3({ name, id, description, color, icon, rows, tagsInput }) {
  const stats = countAll(rows);
  const refs = [];
  const walkRefs = (rs, path) => {
    rs.forEach(r => {
      const newPath = path + (path ? '.' : '') + (r.name || 'items');
      if ((r.faker || '').startsWith('$ref:')) refs.push({ path: newPath, target: r.faker.slice(5) });
      if (r.type === 'object' && r.fields) walkRefs(r.fields, newPath);
      if (r.type === 'array' && r.items) walkRefs([r.items], newPath);
    });
  };
  walkRefs(rows, '');
  const tags = tagsInput.split(',').map(s => s.trim()).filter(Boolean);
  const json = rootSchemaToJson(rows, id, name, description);

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, color: 'white', background: 'hsl(var(--brand-' + color + '))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MIcon name={icon} size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{name || 'Untitled'}</h3>
              <span className="badge mono">{id || '—'}</span>
              {tags.map(t => <span key={t} className="badge"><MIcon name="tag" size={10} /> {t}</span>)}
            </div>
            <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>{description}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <Stat label="Fields" value={stats.total} />
        <Stat label="Required" value={stats.req} />
        <Stat label="References" value={refs.length} color="violet" />
        <Stat label="Max depth" value={stats.maxDepth + 1} color="amber" />
      </div>

      {refs.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ padding: '10px 14px' }}>
            <h3 style={{ fontSize: 13 }}>Cross-schema dependencies</h3>
            <span className="badge violet">{refs.length}</span>
          </div>
          <div className="card-body" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {refs.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>
                <span><b>{id || 'this'}</b>.{r.path}</span>
                <MIcon name="arrow-right" size={12} />
                <span className="badge violet"><MIcon name="link" size={10} /> {r.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Generated JSON Schema</div>
          <button className="btn btn-sm btn-ghost"><MIcon name="copy" size={13} /> Copy</button>
        </div>
        <div className="sheet-preview">
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>{JSON.stringify(json, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="card">
      <div className="card-body">
        <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.05 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 600, color: color ? 'hsl(var(--brand-' + color + '))' : 'hsl(var(--foreground))', marginTop: 4 }}>{value}</div>
      </div>
    </div>
  );
}



function CreateSchemaSheet({ onClose }) {
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState('Address');
  const [color, setColor] = React.useState('amber');
  const [icon, setIcon] = React.useState('home');
  const [description, setDescription] = React.useState('Postal address with embedded geolocation, phones, and a personId reference.');
  const [tagsInput, setTagsInput] = React.useState('pii, geo');
  const id = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Sample seeded with a realistic nested structure to showcase the builder.
  const [rows, setRows] = React.useState(() => ([
    makeProp('id', 'string', 'string.uuid'),
    Object.assign(makeProp('label', 'string', 'helpers.arrayElement'), { required: false }),
    Object.assign(makeProp('street', 'string', 'location.streetAddress'), { required: true }),
    Object.assign(makeProp('city', 'string', 'location.city'), { required: true }),
    Object.assign(makeProp('country', 'string', 'location.country'), { required: true }),
    (() => {
      const g = makeProp('geo', 'object');
      g.required = true;
      g.fields = [
        Object.assign(makeProp('lat', 'number', 'location.latitude'), { required: true }),
        Object.assign(makeProp('lng', 'number', 'location.longitude'), { required: true }),
        (() => {
          const acc = makeProp('accuracy', 'object');
          acc.fields = [
            Object.assign(makeProp('radiusM', 'integer', 'string.numeric'), { required: false }),
            Object.assign(makeProp('source', 'string', 'helpers.arrayElement'), { required: false }),
          ];
          return acc;
        })(),
      ];
      return g;
    })(),
    (() => {
      const tags = makeProp('tags', 'array');
      tags.items = Object.assign(makeProp('', 'string', 'lorem.word'), { name: '', required: false });
      return tags;
    })(),
    (() => {
      const phones = makeProp('phones', 'array');
      const phone = makeProp('', 'object');
      phone.name = '';
      phone.fields = [
        Object.assign(makeProp('label', 'string', 'helpers.arrayElement'), { required: true }),
        Object.assign(makeProp('number', 'string', 'phone.number'), { required: true }),
        Object.assign(makeProp('primary', 'boolean', 'datatype.boolean'), { required: false }),
      ];
      phones.items = phone;
      return phones;
    })(),
    Object.assign(makeProp('personId', 'string', '$ref:person.id'), { format: 'uuid', required: true }),
  ]));

  const stepValid1 = name.trim().length > 0;
  const stepValid2 = rows.length > 0;

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Create schema">
        <div className="sheet-head">
          <div>
            <h2>Create schema</h2>
            <p className="sub">Define a new entity in <span className="mono" style={{ background: 'hsl(var(--muted))', padding: '1px 6px', borderRadius: 4 }}>identity-platform</span>. Nest fields any depth — objects within objects, arrays of objects, anything JSON Schema supports.</p>
          </div>
          <button className="close" onClick={onClose} aria-label="Close"><MIcon name="x" size={16} /></button>
        </div>

        <div className="sheet-stepper">
          <div className={'step ' + (step === 1 ? 'active' : (step > 1 ? 'done' : ''))}>
            <div className="num">{step > 1 ? <MIcon name="check" size={12} /> : '1'}</div>
            <span>Details</span>
          </div>
          <MIcon name="chevron-right" size={12} />
          <div className={'step ' + (step === 2 ? 'active' : (step > 2 ? 'done' : ''))}>
            <div className="num">{step > 2 ? <MIcon name="check" size={12} /> : '2'}</div>
            <span>Properties</span>
          </div>
          <MIcon name="chevron-right" size={12} />
          <div className={'step ' + (step === 3 ? 'active' : '')}>
            <div className="num">3</div>
            <span>Review</span>
          </div>
        </div>

        <div className="sheet-body">
          {step === 1 && <Step1 {...{ name, setName, id, description, setDescription, color, setColor, icon, setIcon, tagsInput, setTagsInput }} />}
          {step === 2 && <Step2 rows={rows} setRows={setRows} id={id} />}
          {step === 3 && <Step3 {...{ name, id, description, color, icon, rows, tagsInput }} />}
        </div>

        <div className="sheet-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <div className="spacer" />
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
            {step === 1 && 'Step 1 of 3 — Tell Mirage what this schema represents.'}
            {step === 2 && (() => { const s = countAll(rows); return 'Step 2 of 3 — ' + s.total + ' fields · max depth ' + (s.maxDepth + 1); })()}
            {step === 3 && 'Step 3 of 3 — Review and create.'}
          </div>
          <div className="right">
            {step > 1 && <button className="btn" onClick={() => setStep(step - 1)}><MIcon name="chevron-left" size={14} /> Back</button>}
            {step < 3 && <button className="btn btn-primary" disabled={(step === 1 && !stepValid1) || (step === 2 && !stepValid2)} onClick={() => setStep(step + 1)}>Continue <MIcon name="chevron-right" size={14} /></button>}
            {step === 3 && <button className="btn btn-primary" onClick={onClose}><MIcon name="check" size={14} /> Create schema</button>}
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { CreateSchemaSheet });
