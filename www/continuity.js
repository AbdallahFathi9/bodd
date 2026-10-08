(function(){
'use strict';
var api,C,$=function(id){return document.getElementById(id);},episodeCache={},timer=null,pending=null,remaining=0;
var autoNext=true;try{autoNext=JSON.parse(localStorage.getItem('bodd.autoNext'))!==false;}catch(e){}
function tr(value){return window.BoddI18n?window.BoddI18n.t(value):value;}
function setText(id,value){$(id).textContent=tr(value);}
function cancel(){clearInterval(timer);timer=null;pending=null;$('upNext').hidden=true;}
function latestFor(item){return api.state.history.find(function(row){if(!row||!row.item)return false;if(item.kind==='series')return row.item.kind==='episode'&&String(row.item.seriesId||'')===String(item.id);return C.key(row.item)===C.key(item);});}
function resumeFor(item){var row=latestFor(item);return row&&!row.completed&&Number.isFinite(Number(row.position))&&Number(row.position)>0?row:null;}
function remember(series,episodes){episodeCache[String(series.id)]=episodes;var changed=false;api.state.history.forEach(function(row){if(!row.item||row.item.kind!=='episode')return;var fresh=episodes.find(function(ep){return ep.id===row.item.id;});if(fresh&&(!row.item.seriesId||String(row.item.seriesId)===String(series.id))){row.item=Object.assign({},row.item,fresh);changed=true;}});if(changed)api.persistHistory();return episodes;}
function sequence(item,list){if(item.kind!=='episode')return list;var saved=item.seriesId&&episodeCache[String(item.seriesId)];if(saved&&saved.some(function(ep){return ep.id===item.id;}))return saved;if(!item.seriesId)return [item];return null;}
function adjacent(direction){var current=api.state.playing,list=api.state.sequence;if(!current||current.kind!=='episode')return null;var index=list.findIndex(function(item){return item.kind==='episode'&&item.id===current.id;});var candidate=index>=0?list[index+direction]:null;return candidate&&candidate.kind==='episode'&&String(candidate.seriesId||'')===String(current.seriesId||'')?candidate:null;}
function next(){return adjacent(1);}
function previous(){return adjacent(-1);}
function playPrevious(){var item=previous();if(!item)return;var list=api.state.sequence.slice();cancel();api.play(item,list,{fromStart:true});}
function playNext(){var item=next();if(!item)return;var list=api.state.sequence.slice();cancel();api.play(item,list,{fromStart:true});}
function update(){var current=api.state.playing,isEpisode=!!current&&current.kind==='episode';$('nextEpisode').hidden=!isEpisode;$('nextEpisode').disabled=!next();$('previousEpisode').hidden=!isEpisode;$('previousEpisode').disabled=!previous();}
function finished(){if(!api.state.playing||api.state.playing.kind!=='episode')return;var item=next();update();if(!item){setText('playStatus','Series finished.');return;}if(!autoNext||(document.hidden&&!window.BoddPlayback.pipActive())||!document.getElementById('playbackOptions').hidden||window.BoddFeatures.isOpen()||window.BoddAdvanced.isOpen()||!$('accounts').hidden)return;cancel();pending={key:C.key(api.state.playing),account:api.accountKey()};remaining=5;setText('upNextTitle',item.name);setText('upNextStatus','Next episode starts in '+remaining+' seconds.');$('upNext').hidden=false;api.controls();$('cancelNext').focus();timer=setInterval(function(){if(!pending||!api.state.playing||C.key(api.state.playing)!==pending.key||api.accountKey()!==pending.account||(document.hidden&&!window.BoddPlayback.pipActive())||!document.getElementById('playbackOptions').hidden||window.BoddFeatures.isOpen()||window.BoddAdvanced.isOpen()||!$('accounts').hidden||!$('dialog').hidden){cancel();return;}remaining--;if(remaining<=0){playNext();return;}setText('upNextStatus','Next episode starts in '+remaining+' seconds.');},1000);}
window.BoddContinuity={
init:function(options){api=options;C=window.PlayerCore;$('autoNextEpisode').checked=autoNext;$('autoNextEpisode').onchange=function(){autoNext=this.checked;try{localStorage.setItem('bodd.autoNext',JSON.stringify(autoNext));}catch(e){}if(!autoNext)cancel();};$('previousEpisode').onclick=playPrevious;$('nextEpisode').onclick=playNext;$('playNextNow').onclick=playNext;$('cancelNext').onclick=function(){cancel();api.controls();$('nextEpisode').focus();};$('video').addEventListener('ended',finished);document.addEventListener('visibilitychange',function(){if(document.hidden&&!window.BoddPlayback.pipActive())cancel();});},
latestFor:latestFor,resumeFor:resumeFor,remember:remember,sequence:sequence,
prepare:function(item){var account=api.accountKey();return api.request('get_series_info',{series_id:item.seriesId}).then(function(info){if(api.accountKey()!==account)return [];return remember({id:item.seriesId,name:item.seriesName||''},C.mapEpisodes(info,{id:item.seriesId,name:item.seriesName||''}));});},
reset:function(){cancel();episodeCache={};},cancel:cancel,update:update,
back:function(){if(!pending)return false;cancel();api.controls();return true;},
started:function(){cancel();update();},
next:next
};
})();
