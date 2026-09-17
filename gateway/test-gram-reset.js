(function(){
  'use strict';

  var done=false;

  function notify(text,color){
    try{if(typeof window.showPickup==='function')window.showPickup(text,color||'#7dff9f')}catch(_){}
  }

  async function resetGram(btn){
    if(done)return;
    var ok=false;
    try{ok=window.confirm('Обнулить ТОЛЬКО тестовые Gram?\n\nPPA, предметы, шмот, заточка, покупки и уровень останутся.')}catch(_){ok=false}
    if(!ok)return;

    try{
      if(!window.PPA||typeof window.PPA.ppaSaveGame!=='function')throw new Error('Облачный сейв ещё не подключён');
      btn.disabled=true;
      btn.textContent='ОБНУЛЯЮ GRAM…';

      if(window.INV)window.INV.gram=0;
      try{if(typeof window.saveGame==='function')window.saveGame()}catch(_){}

      var snap=null;
      try{if(typeof window.ppaBuildSaveObject==='function')snap=window.ppaBuildSaveObject()}catch(_){}
      if(!snap){
        try{snap=JSON.parse(localStorage.getItem('pxSave')||'null')}catch(_){snap=null}
      }
      if(!snap||typeof snap!=='object')throw new Error('Не удалось собрать текущий сейв');
      snap.gram=0;

      var version=null;
      try{version=window.PPA_CLOUD&&window.PPA_CLOUD.version}catch(_){}
      await window.PPA.ppaSaveGame(snap,version);

      try{
        if(window.INV)window.INV.gram=0;
        if(typeof window.saveGame==='function')window.saveGame();
        if(typeof window.sendInvState==='function')window.sendInvState();
        if(typeof window.sendPremiumState==='function')window.sendPremiumState();
        if(typeof window.sendAuctionState==='function')window.sendAuctionState();
        if(typeof window.sendGramWalletState==='function')window.sendGramWalletState();
        if(typeof window.updateUI==='function')window.updateUI();
      }catch(_){}

      done=true;
      btn.textContent='GRAM ОБНУЛЕНЫ ✓';
      btn.style.opacity='0.65';
      notify('ТЕСТОВЫЕ GRAM ОБНУЛЕНЫ','#7dff9f');
    }catch(e){
      console.warn('PPA test Gram reset:',e);
      btn.disabled=false;
      btn.textContent='ОБНУЛИТЬ ТЕСТ GRAM';
      notify('НЕ УДАЛОСЬ ОБНУЛИТЬ GRAM','#ff7777');
      try{window.alert(String((e&&e.message)||e||'Ошибка'))}catch(_){}
    }
  }

  function inject(){
    if(done)return;
    try{
      var frame=document.getElementById('gramWalletFrame');
      if(!frame||!frame.contentDocument)return;
      var d=frame.contentDocument;
      if(d.getElementById('ppaTestGramResetBtn'))return;
      var gram=d.getElementById('gameGram');
      if(!gram)return;

      var wrap=d.createElement('div');
      wrap.id='ppaTestGramResetWrap';
      wrap.style.cssText='margin:14px 0 4px 0;display:flex;justify-content:center;width:100%;';
      var b=d.createElement('button');
      b.id='ppaTestGramResetBtn';
      b.type='button';
      b.textContent='ОБНУЛИТЬ ТЕСТ GRAM';
      b.style.cssText='width:min(360px,92%);min-height:44px;border:1px solid #9c573f;border-radius:9px;background:linear-gradient(180deg,#4b1b16,#24100d);color:#ffd7bd;font:700 13px Georgia,serif;letter-spacing:.4px;';
      b.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();resetGram(b)});
      wrap.appendChild(b);

      var parent=gram.parentElement;
      if(parent&&parent.parentElement)parent.parentElement.appendChild(wrap);else d.body.appendChild(wrap);
    }catch(_){}
  }

  setInterval(inject,400);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject,{once:true});else inject();
})();
