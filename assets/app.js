const cards=[...document.querySelectorAll('.card')];
const hero=document.getElementById('hero');
const latest=document.querySelector('.card[data-latest="1"]');
const empty=document.getElementById('empty');
let cat='全部',q='';
function apply(){
  let n=0;
  const filtering = cat!=='全部'||q!=='';
  if(hero) hero.style.display = filtering?'none':'';
  cards.forEach(c=>{
    const ok=(cat==='全部'||c.dataset.cat===cat)&&(!q||c.dataset.search.includes(q));
    const hideLatest = !filtering && c.dataset.latest==='1';
    c.style.display=(ok&&!hideLatest)?'':'none';
    if(ok&&!hideLatest)n++;
  });
  empty.style.display=n?'none':'block';
}
document.querySelectorAll('.chip').forEach(ch=>ch.addEventListener('click',()=>{
  document.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));
  ch.classList.add('on');cat=ch.dataset.cat;apply();
}));
const si=document.getElementById('search');
if(si) si.addEventListener('input',()=>{q=si.value.trim().toLowerCase();apply();});
apply();
