import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findRoute,stationName,searchStations} from '../subway.mjs';

const data=JSON.parse(readFileSync(new URL('../public/subway-data.json',import.meta.url),'utf8'));
const route=(a,b,mode)=>findRoute(data,a,b,{mode});

test('data covers lines 1-9 with consistent segments and key transfer stations',()=>{
 assert.deepEqual(Object.keys(data.lines),['1','2','3','4','5','6','7','8','9']);
 for(const [id,line] of Object.entries(data.lines))for(const s of line.segments){
  assert.equal(s.times.length,s.stations.length-1,id);assert.ok(s.times.every(t=>t>0&&t<15),id);
 }
 for(const [station,lines] of [['서울역',['1','4']],['고속터미널',['3','7','9']],['종로3가',['1','3','5']],['총신대입구',['4','7']],['노량진',['1','9']],['금정',['1','4']]])
  assert.deepEqual(data.stations[station],lines,station);
 assert.ok(Object.keys(data.stations).length>380);
});

test('station names accept common spellings',()=>{
 assert.equal(stationName(data,'강남역'),'강남');
 assert.equal(stationName(data,'서울'),'서울역');
 assert.equal(stationName(data,'이수'),'총신대입구');
 assert.equal(stationName(data,'흑석(중앙대입구)'),'흑석');
 assert.equal(stationName(data,'없는역'),null);
 assert.deepEqual(searchStations(data,'고속'),['고속터미널']);
});

test('a same-line trip needs no transfer and counts stops along the line',()=>{
 const r=route('강남','홍대입구');
 assert.equal(r.transferCount,0);assert.equal(r.legs[0].name,'2호선');assert.equal(r.stops,17);
 assert.ok(r.minutes>=30&&r.minutes<=45,String(r.minutes));
});

test('routes transfer where lines meet and report the walk',()=>{
 const r=route('노원','잠실');
 assert.equal(r.transferCount,1);assert.equal(r.transfers[0].station,'건대입구');
 assert.deepEqual(r.legs.map(l=>l.line),['7','2']);
 assert.equal(r.legs[0].to,r.legs[1].from);
});

test('the Eungam loop on line 6 runs one way only',()=>{
 assert.equal(route('불광','구산').legs[0].next,'독바위');
 assert.equal(route('구산','불광').legs[0].next,'응암');
});

test('fewest-transfer mode never uses more transfers than the fastest route',()=>{
 for(const [a,b] of [['신림','왕십리'],['대화','오이도'],['까치산','신설동'],['김포공항','잠실'],['인천','노원']]){
  const fast=route(a,b,'fastest'),few=route(a,b,'fewest');
  assert.ok(few.transferCount<=fast.transferCount,`${a}→${b}`);
  assert.ok(few.minutes>=fast.minutes-0.5,`${a}→${b}`);
 }
});

test('branches and estimated sections are reachable',()=>{
 assert.equal(route('성수','신설동').transferCount,0);
 assert.ok(route('강동','마천').legs.every(l=>l.line==='5'));
 const r=route('개화','중앙보훈병원');assert.equal(r.estimated,true);assert.equal(r.legs[0].line,'9');
 assert.equal(route('인천','신창').legs.every(l=>l.line==='1'),true);
});

test('invalid requests explain the problem',()=>{
 assert.throws(()=>route('강남','강남'),/같아요/);
 assert.throws(()=>route('없는역','강남'),/찾지 못했어요/);
});

import {findRouteVia} from '../subway.mjs';
import {upcoming,weekTag,departures} from '../subway-api.mjs';

test('via routes stay on the train when the line continues and transfer otherwise',()=>{
 const through=findRouteVia(data,'강남','역삼','삼성');
 assert.equal(through.transferCount,0);assert.equal(through.legs.length,1);assert.equal(through.via,'역삼');
 const change=findRouteVia(data,'강남','교대','고속터미널');
 assert.equal(change.transferCount,1);assert.equal(change.transfers[0].atVia,true);
 assert.ok(change.minutes>=findRouteVia(data,'강남','','고속터미널').minutes-1);
 const back=findRouteVia(data,'역삼','삼성','강남');
 assert.equal(back.transfers[0].fromLine,back.transfers[0].toLine,'reversing at the via station is a same-line transfer');
 assert.equal(findRouteVia(data,'강남','','홍대입구').minutes,route('강남','홍대입구').minutes);
});

test('every station has map coordinates inside the metropolitan area',()=>{
 for(const name of Object.keys(data.stations)){
  const [lat,lon]=data.coords[name]||[];
  assert.ok(lat>36.7&&lat<38.2&&lon>126.5&&lon<127.4,name);
 }
 assert.ok(data.approxCoords.length<=3,data.approxCoords.join(','));
});

test('departures pick the next trains per direction and skip arrival-only rows',()=>{
 const rows=[
  {INOUT_TAG:'1',LEFTTIME:'08:10:00',ARRIVETIME:'08:09:30',SUBWAYENAME:'성수',EXPRESS_YN:'G'},
  {INOUT_TAG:'1',LEFTTIME:'08:04:00',ARRIVETIME:'08:03:30',SUBWAYENAME:'성수',EXPRESS_YN:'G'},
  {INOUT_TAG:'1',LEFTTIME:'07:59:00',ARRIVETIME:'07:58:30',SUBWAYENAME:'성수',EXPRESS_YN:'G'},
  {INOUT_TAG:'2',LEFTTIME:'00:00:00',ARRIVETIME:'08:05:00',SUBWAYENAME:'강남',EXPRESS_YN:'G'},
  {INOUT_TAG:'2',LEFTTIME:'24:05:00',ARRIVETIME:'24:04:30',SUBWAYENAME:'신도림(구로구청)',EXPRESS_YN:'Y'}
 ];
 const result=upcoming(rows,8*60);
 assert.deepEqual(result[0].trains.map(t=>t.time),['08:04','08:10']);
 assert.equal(result[0].trains[0].minutesLeft,4);
 assert.equal(result[1].trains[0].time,'00:05');assert.equal(result[1].trains[0].destination,'신도림');assert.equal(result[1].trains[0].express,true);
 assert.equal(weekTag(new Date('2026-11-21T03:00:00Z')),'2');assert.equal(weekTag(new Date('2026-11-22T03:00:00Z')),'3');assert.equal(weekTag(new Date('2026-11-23T03:00:00Z')),'1');
});

test('departures without a key ask for one instead of failing',async()=>{
 assert.deepEqual(await departures('강남역',{key:''}),{needsKey:true,station:'강남'});
});

import {placeTrains,approaching,travelMinutes,laneName} from '../subway.mjs';
import {parsePositions,positions} from '../subway-api.mjs';

test('realtime trains are placed by direction on the right segment',()=>{
 const trains=parsePositions([
  {trainNo:'1',statnNm:'역삼',updnLine:'0',statnTnm:'성수종착',trainSttus:'1',directAt:'0',lstcarAt:'0'},
  {trainNo:'2',statnNm:'선릉',updnLine:'1',statnTnm:'성수종착',trainSttus:'2',directAt:'0',lstcarAt:'1'},
  {trainNo:'3',statnNm:'신정네거리',updnLine:'1',statnTnm:'신도림지선',trainSttus:'1',directAt:'0',lstcarAt:'0'},
  {trainNo:'4',statnNm:'다산',updnLine:'0',statnTnm:'별내',trainSttus:'1',directAt:'0',lstcarAt:'0'}
 ]);
 assert.equal(trains[1].last,true);assert.equal(trains[2].destination,'신도림');
 const placed=placeTrains(data,'2',trains.slice(0,3));
 const loop=placed.segs[0],seg=data.lines['2'].segments[0];
 assert.equal(loop.find(t=>t.no==='1').d,1,'line 2 updn 0 is 내선 (forward in data order)');
 assert.equal(laneName('2',seg,1),'내선순환');
 const branch=placed.segs[2].find(t=>t.no==='3');assert.equal(branch.d,-1,'heads to 신도림 by destination');
 assert.deepEqual(placeTrains(data,'8',trains.slice(3)).unknown,['다산']);
 const four=placeTrains(data,'4',parsePositions([{trainNo:'5',statnNm:'노원',updnLine:'0',statnTnm:'불암산',trainSttus:'1'}]));
 assert.equal(four.segs[0][0].d,-1);assert.equal(laneName('4',data.lines['4'].segments[0],-1),'당고개 방면');
});

test('approaching trains report distance and minutes to the chosen station',()=>{
 const trains=parsePositions([
  {trainNo:'1',statnNm:'역삼',updnLine:'0',statnTnm:'성수종착',trainSttus:'1'},
  {trainNo:'2',statnNm:'교대',updnLine:'1',statnTnm:'성수종착',trainSttus:'2'},
  {trainNo:'3',statnNm:'삼성',updnLine:'0',statnTnm:'성수종착',trainSttus:'1'}
 ]);
 const placed=placeTrains(data,'2',trains);
 const near=approaching(data,'2',placed,'강남');
 const inner=near.find(n=>n.lane==='내선순환'),outer=near.find(n=>n.lane==='외선순환');
 assert.equal(inner.train.no,'1');assert.equal(inner.dist,1);assert.ok(inner.minutes>=1&&inner.minutes<4,String(inner.minutes));
 assert.equal(outer.train.no,'2');assert.ok(outer.dist>0.6&&outer.dist<0.8,String(outer.dist));
 const seg=data.lines['2'].segments[0],i=seg.stations.indexOf('시청');
 assert.ok(travelMinutes(seg,seg.stations.length-2,i,1)>0&&travelMinutes(seg,seg.stations.length-2,i,1)<4,'wraps around the loop');
});

test('realtime positions without a key ask for one',async()=>{
 assert.deepEqual(await positions('2',{key:''}),{needsKey:true,line:'2'});
 await assert.rejects(positions('0',{key:'x'}),/노선/);
});

import {pickTrains,servesStation,plan} from '../subway-api.mjs';

test('the boarding plan picks a train that really reaches the alighting station',()=>{
 const leg=findRoute(data,'노원','사당').legs[0];
 const row=(no,left,dest,inout='2')=>({TRAIN_NO:no,LEFTTIME:left,ARRIVETIME:left,SUBWAYENAME:dest,INOUT_TAG:inout,EXPRESS_YN:'G'});
 const board=[row('A','08:01:00','당고개','1'),row('B','08:03:00','한성대입구'),row('C','08:06:00','오이도'),row('D','08:12:00','사당')];
 const alight=[row('C','08:52:00','오이도'),row('D','08:58:00','사당'),row('A','07:10:00','당고개','1')];
 const picked=pickTrains(data,leg,board,alight,8*60);
 assert.deepEqual(picked.map(t=>t.no),['C','D'],'opposite direction and short-turn trains are skipped');
 assert.equal(picked[0].arrive,8*60+52);
 const noAlight=pickTrains(data,leg,board,[],8*60);
 assert.deepEqual(noAlight.map(t=>t.no),['C','D'],'without the alighting timetable the destination decides');
 assert.equal(servesStation(data,'4','노원,창동'.split(','),'당고개'),false);
 assert.equal(servesStation(data,'1',['서울역','남영'],'인천'),true);
 assert.equal(servesStation(data,'4',['노원','상계'],'진접'),true,'unknown extensions pass');
});

test('the boarding plan without a key asks for one and still validates stations',async()=>{
 assert.deepEqual(await plan({from:'노원',to:'사당'},{key:'',data}),{needsKey:true});
 await assert.rejects(plan({from:'없는역',to:'사당'},{key:'',data}),/찾지 못했어요/);
});

test('a train reported twice keeps only its latest position',()=>{
 const trains=parsePositions([
  {trainNo:'3195',statnNm:'불광',updnLine:'1',statnTnm:'오금',trainSttus:'1',recptnDt:'2026-11-23 13:32:15'},
  {trainNo:'3195',statnNm:'녹번',updnLine:'1',statnTnm:'오금',trainSttus:'2',recptnDt:'2026-11-23 13:35:15'},
  {trainNo:'4590',statnNm:'총신대입구(이수)',updnLine:'0',statnTnm:'불암산',trainSttus:'1',recptnDt:'2026-11-23 13:35:18'},
  {trainNo:'4590',statnNm:'총신대입구(이수)',updnLine:'0',statnTnm:'불암산',trainSttus:'1',recptnDt:'2026-11-23 13:35:18'}
 ]);
 assert.equal(trains.length,2);assert.equal(trains[0].station,'녹번');assert.equal(trains[0].status,2);
});

import {parseArrivals,congestionAt,congestionLevel} from '../subway-api.mjs';

test('station arrivals group by direction with clean labels and a live countdown',()=>{
 const now=Date.parse('2026-11-23T13:48:30+09:00');
 const lines=parseArrivals([
  {subwayId:'1004',updnLine:'상행',trainLineNm:'불암산행 - 상계방면',btrainSttus:'일반',barvlDt:'120',btrainNo:'4584',bstatnNm:'불암산',recptnDt:'2026-11-23 13:48:00',arvlMsg2:'전역 도착',arvlMsg3:'창동',arvlCd:'5',lstcarAt:'0',ordkey:'01001불암산0'},
  {subwayId:'1006',updnLine:'하행',trainLineNm:'봉화산행 - 월드컵경기장(성산)방면',btrainSttus:'급행',barvlDt:'0',btrainNo:'6157',bstatnNm:'봉화산',recptnDt:'2026-11-23 13:48:00',arvlMsg2:'전역 출발',arvlCd:'3',lstcarAt:'1',ordkey:'11001봉화산0'},
  {subwayId:'1063',updnLine:'상행',trainLineNm:'문산행',barvlDt:'60',btrainNo:'K1',bstatnNm:'문산',recptnDt:'2026-11-23 13:48:00',ordkey:'0'}
 ],{data,now});
 assert.deepEqual(lines.map(l=>l.line),['4','6'],'non 1-9 lines are dropped');
 const up=lines[0].directions[0];assert.equal(up.label,'상계방면');assert.equal(up.trains[0].destination,'당고개');assert.equal(up.trains[0].seconds,90);
 const down=lines[1].directions[0];assert.equal(down.label,'월드컵경기장방면');assert.equal(down.trains[0].seconds,null);assert.equal(down.trains[0].express,'급행');assert.equal(down.trains[0].last,true);
});

test('average congestion is looked up by station, line, direction, day and half hour',()=>{
 const source={slots:['05:30','06:00','06:30'],stations:{'강남':{'2':{up:{weekday:[10,50,140]}}}}};
 assert.deepEqual(congestionAt('강남','2','up',6*60+10,'1',source),{percent:50,level:'보통',slot:'06:00'});
 assert.equal(congestionAt('강남','2','up',6*60+40,'1',source).level,'매우 붐빔');
 assert.equal(congestionAt('강남','2','down',6*60,'1',source),null);
 assert.equal(congestionAt('강남','2','up',4*60,'1',source),null);
 assert.equal(congestionLevel(20),'여유');assert.equal(congestionLevel(100),'붐빔');
 const real=congestionAt('강남','2','up',8*60+30,'1');assert.ok(real&&real.percent>0,'built congestion file has Gangnam');
});
