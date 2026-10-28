/* Attendly Dark Mode — standalone, no dependencies */
(function(){
  "use strict";
  const KEY="attendly-theme", ID="attendly-theme-toggle";
  function apply(theme){
    const dark=theme==="dark";
    document.body.classList.toggle("attendly-dark",dark);
    document.documentElement.style.colorScheme=dark?"dark":"light";
    const b=document.getElementById(ID);
    if(b){b.textContent=dark?"☀":"☾";b.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode");b.title=dark?"Switch to light mode":"Switch to dark mode";}
  }
  function init(){
    const b=document.createElement("button");b.id=ID;b.type="button";b.textContent="☾";
    b.setAttribute("aria-label","Switch to dark mode");b.title="Switch to dark mode";
    b.addEventListener("click",function(){
      const next=document.body.classList.contains("attendly-dark")?"light":"dark";
      try{localStorage.setItem(KEY,next)}catch(_){}
      apply(next);
    });
    document.body.appendChild(b);
    let saved="light";try{saved=localStorage.getItem(KEY)==="dark"?"dark":"light"}catch(_){}
    apply(saved);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
