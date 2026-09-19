/** DB WORK - Google Sheets database API */
const SHEET_USERS = 'Users';
const SHEET_LOCATIONS = 'Locations';
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'bootstrap';
  try { if (action === 'bootstrap') return json_(bootstrap_()); return json_({ok:false,error:'Unknown action'}); }
  catch(err) { return json_({ok:false,error:String(err)}); }
}
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'saveUsers') return json_(saveUsers_(body.users || []));
    if (body.action === 'saveLocations') return json_(saveLocations_(body.locations || []));
    return json_({ok:false,error:'Unknown action'});
  } catch(err) { return json_({ok:false,error:String(err)}); }
}
function bootstrap_(){ const ss=SpreadsheetApp.getActiveSpreadsheet(); ensureSheets_(ss); return {ok:true,users:readUsers_(),locations:readLocations_()}; }
function ensureSheets_(ss){
  let u=ss.getSheetByName(SHEET_USERS); if(!u)u=ss.insertSheet(SHEET_USERS);
  if(u.getLastRow()===0){u.getRange(1,1,1,4).setValues([['username','displayName','password','role']]);u.getRange(2,1,3,4).setValues([['admin','System Administrator','admin123','admin'],['editor','Demo Editor','editor123','editor'],['viewer','Demo Viewer','viewer123','viewer']]);}
  let l=ss.getSheetByName(SHEET_LOCATIONS); if(!l)l=ss.insertSheet(SHEET_LOCATIONS);
  if(l.getLastRow()===0)l.getRange(1,1,1,6).setValues([['id','name','city','address','country','data_json']]);
}
function readUsers_(){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);const v=sh.getDataRange().getValues();if(v.length<2)return[];return v.slice(1).filter(r=>r[0]!=='').map(r=>({username:String(r[0]),displayName:String(r[1]||''),password:String(r[2]||''),role:String(r[3]||'viewer')}));}
function readLocations_(){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOCATIONS);const v=sh.getDataRange().getValues();if(v.length<2)return[];return v.slice(1).filter(r=>r[0]!=='').map(r=>{let d={};try{d=JSON.parse(String(r[5]||'{}'));}catch(_){}return{id:String(r[0]),name:String(r[1]||''),city:String(r[2]||''),address:String(r[3]||''),country:String(r[4]||''),rooms:Array.isArray(d.rooms)?d.rooms:[],residents:Array.isArray(d.residents)?d.residents:[],arrivals:Array.isArray(d.arrivals)?d.arrivals:[]};});}
function saveUsers_(users){const ss=SpreadsheetApp.getActiveSpreadsheet();ensureSheets_(ss);const sh=ss.getSheetByName(SHEET_USERS);sh.clearContents();sh.getRange(1,1,1,4).setValues([['username','displayName','password','role']]);if(users.length)sh.getRange(2,1,users.length,4).setValues(users.map(u=>[String(u.username||''),String(u.displayName||''),String(u.password||''),String(u.role||'viewer')]));return{ok:true};}
function saveLocations_(locations){const ss=SpreadsheetApp.getActiveSpreadsheet();ensureSheets_(ss);const sh=ss.getSheetByName(SHEET_LOCATIONS);sh.clearContents();sh.getRange(1,1,1,6).setValues([['id','name','city','address','country','data_json']]);if(locations.length)sh.getRange(2,1,locations.length,6).setValues(locations.map(l=>[String(l.id||''),String(l.name||''),String(l.city||''),String(l.address||''),String(l.country||''),JSON.stringify({rooms:l.rooms||[],residents:l.residents||[],arrivals:l.arrivals||[]})]));return{ok:true};}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
