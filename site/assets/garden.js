(() => {
  'use strict';
  const canvas = document.getElementById('garden-canvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const section=canvas.closest('#garden');
  let targets=[];

  const faces = [];
  const tau = Math.PI * 2;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let seed = 2255;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const subtract = (a, b) => a.map((v, i) => v - b[i]);
  const scale = (a, amount) => a.map(v => v * amount);
  const cross = ([x,y,z], [a,b,c]) => [y*c-z*b, z*a-x*c, x*b-y*a];
  const unit = v => scale(v, 1 / (Math.hypot(...v) || 1));

  function face(points, color, group) {
    const normal = unit(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));
    const light = .79 + .30 * Math.max(0, -normal[0]*.56 + normal[1]*.75 + normal[2]*.35);
    const fill = color.map(v => Math.min(255, Math.round(v * light)));
    faces.push({points, fill: `rgb(${fill.join(',')})`, group});
  }

  function cylinder(start, end, bottom, top, color, sides = 9) {
    const axis = unit(subtract(end, start));
    const u = unit(cross(Math.abs(axis[1]) < .95 ? [0,1,0] : [1,0,0], axis));
    const v = cross(axis, u);
    const ring = (at, radius) => Array.from({length:sides}, (_, i) => {
      const angle = i * tau / sides;
      return add(at, add(scale(u, radius*Math.cos(angle)), scale(v, radius*Math.sin(angle))));
    });
    const low = ring(start,bottom), high = ring(end,top);
    for (let i=0;i<sides;i++) {
      const next = (i+1)%sides;
      face([low[i],low[next],high[next],high[i]],color);
    }
    face(high,color);
    face(low.reverse(),color);
  }

  function ellipsoid(center, radii, color, detail = 8) {
    const rows = 4;
    const point = (i,j) => {
      const latitude = Math.PI * (i/rows-.5), longitude = j*tau/detail;
      return add(center, [
        radii[0]*Math.cos(latitude)*Math.cos(longitude),
        radii[1]*Math.sin(latitude),
        radii[2]*Math.cos(latitude)*Math.sin(longitude)
      ]);
    };
    for(let i=0;i<rows;i++)for(let j=0;j<detail;j++) {
      const a=point(i,j), b=point(i+1,j), c=point(i+1,j+1), d=point(i,j+1);
      face(i===0?[a,b,c]:i===rows-1?[a,b,d]:[a,b,c,d],color);
    }
  }

  function box(center, size, color, group) {
    const corners = [
      [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
      [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]
    ].map(p=>add(center,p.map((v,i)=>v*size[i]/2)));
    for(const indexes of [[3,2,1,0],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]]) {
      face(indexes.map(i=>corners[i]),color,group);
    }
  }

  const wood=[112,71,83], leaf=[119,181,155];
  const petals=[[234,144,176],[249,175,197],[219,121,170],[255,207,217],[197,137,194]];
  cylinder([0,-.38,0],[0,-.19,0],3.14,3.2,[95,63,110],48);
  cylinder([0,-.19,0],[0,-.10,0],3.21,3.21,[226,161,165],48);
  cylinder([0,-.10,0],[0,.02,0],3.22,3.08,[161,168,159],48);
  ellipsoid([-.63,.02,-.25],[1.30,.1,.77],[144,151,147],12);
  const groundFaceCount=faces.length;

  const root=[-.70,.06,-.28], fork=[-.80,1.46,-.32], crown=[-.53,2.89,-.49];
  cylinder(root,fork,.26,.17,wood);
  cylinder(fork,crown,.17,.071,wood);
  for(let i=0;i<8;i++) {
    const angle=i*tau/8, radius=.63+random()*.46;
    const base=[fork[0],1.39+i*.12,fork[2]];
    const elbow=add(base,[Math.cos(angle)*radius*.64,.36,Math.sin(angle)*radius*.64]);
    const tip=add(elbow,[Math.cos(angle)*radius*.75,.35+random()*.40,Math.sin(angle)*radius*.75]);
    cylinder(base,elbow,.093,.049,wood,7);
    cylinder(elbow,tip,.05,.014,wood,7);
    for(let j=0;j<4;j++) {
      const blossom=add(tip,[(random()-.5)*.8,(random()-.35)*.55,(random()-.5)*.80]);
      const radius=.28+random()*.19;
      ellipsoid(blossom,[radius,radius*.69,radius*.89],petals[(i+j)%petals.length],6);
    }
  }
  for(let i=0;i<6;i++) {
    const angle=i*tau/6;
    ellipsoid(add(crown,[Math.cos(angle)*.53,random()*.22,Math.sin(angle)*.49]),[.44,.34,.40],petals[i%petals.length],7);
  }
  for(let i=0;i<22;i++) {
    const angle=i*2.39996, radius=1.38+random()*1.40;
    const base=[Math.cos(angle)*radius,.04,Math.sin(angle)*radius];
    const height=.27+random()*.46;
    const head=add(base,[(random()-.5)*.15,height,(random()-.5)*.14]);
    cylinder(base,head,.022,.014,[78,131,115],5);
    ellipsoid(add(base,[.08,height*.46,.045]),[.12,.055,.075],leaf,5);
    for(let j=0;j<5;j++) {
      const a=j*tau/5;
      ellipsoid(add(head,[Math.cos(a)*.106,.019,Math.sin(a)*.106]),[.093,.055,.093],petals[(i+1)%petals.length],5);
    }
    ellipsoid(add(head,[0,.045,0]),[.063,.046,.063],[254,203,128],5);
  }

  box([1.41,.29,.90],[.62,.54,.58],[164,103,172]);
  box([1.41,.57,.90],[.68,.13,.64],[216,142,199]);
  box([1.41,.34,1.198],[.10,.64,.03],[249,199,139]);
  box([1.41,.65,.90],[.10,.045,.65],[249,199,139]);
  ellipsoid([1.29,.70,.90],[.14,.067,.071],[243,181,137],7);
  ellipsoid([1.53,.70,.90],[.14,.067,.071],[243,181,137],7);

  box([0,0,0],[1.02,.62,.07],[242,183,190],'letter');
  face([[-.51,.31,.046],[.51,.31,.046],[0,-.08,.047]],[255,224,213],'letter');
  face([[-.51,-.31,.05],[0,-.025,.05],[.51,-.31,.05]],[244,197,201],'letter');
  face([[-.10,-.05,.065],[0,.02,.075],[.10,-.05,.065],[0,-.16,.075]],[185,94,134],'letter');
  const specks=Array.from({length:76},()=>[random(),random(),.4+random()*1.45]);

  let yaw=-.38, target=yaw, width=0, height=0, frame=0, visible=false, drag, lastFrame=-Infinity;
  const pitch=.30, sinPitch=Math.sin(pitch), cosPitch=Math.cos(pitch);
  function render(time) {
    frame=0;
    if(!width||!height)return;
    if(!reducedMotion.matches&&time-lastFrame<30){requestDraw();return;}
    lastFrame=time;
    yaw=reducedMotion.matches?target:yaw+(target-yaw)*.16;
    const backdrop=ctx.createLinearGradient(0,0,0,height);
    backdrop.addColorStop(0,'#19132c');
    backdrop.addColorStop(.64,'#4b2f56');
    backdrop.addColorStop(1,'#26182f');
    ctx.fillStyle=backdrop;ctx.fillRect(0,0,width,height);
    for(const [x,y,r] of specks){
      ctx.fillStyle=r>1.4?'#f5cead':'#bda3c1';
      ctx.fillRect(x*width,y*height*.78,r,r);
    }
    const moonX=width*.73, moonY=height*.22, moonR=Math.min(width,height)*.087;
    const halo=ctx.createRadialGradient(moonX,moonY,moonR*.5,moonX,moonY,moonR*2.7);
    halo.addColorStop(0,'#ffcda579');halo.addColorStop(1,'#ffcda500');
    ctx.fillStyle=halo;ctx.fillRect(moonX-moonR*3,moonY-moonR*3,moonR*6,moonR*6);
    ctx.beginPath();ctx.arc(moonX,moonY,moonR,0,tau);
    const moonShade=ctx.createLinearGradient(moonX,moonY-moonR,moonX,moonY+moonR);
    moonShade.addColorStop(0,'#fff1db');moonShade.addColorStop(1,'#edacaf');
    ctx.fillStyle=moonShade;ctx.fill();

    const c=Math.cos(yaw), s=Math.sin(yaw);
    const zoom=Math.min(width/7.38,height/5.85);
    const hover=reducedMotion.matches?0:Math.sin(time/900)*.09;
    const letterAngle=-yaw-.13, lc=Math.cos(letterAngle), ls=Math.sin(letterAngle);
    const project=([x,y,z],group)=>{
      if(group==='letter'){
        [x,z]=[x*lc-z*ls+1.58,x*ls+z*lc-.40];
        y+=1.23+hover;
      }
      const horizontal=x*c-z*s, depth=x*s+z*c;
      return [width*.5+horizontal*zoom,height*.70-(y*cosPitch-depth*sinPitch)*zoom,
        depth*cosPitch+y*sinPitch];
    };
    targets=[
      {center:project([0,0,0],'letter'), radius:.53*zoom, action:'new-letter'},
      {center:project([1.41,.38,.90]), radius:.39*zoom, action:'open-gift'}
    ].sort((a,b)=>b.center[2]-a.center[2]);
    const projected=faces.map(({points,fill,group},index)=>{
      const polygon=points.map(point=>project(point,group));
      const depth=polygon.reduce((sum,p)=>sum+p[2],0)/polygon.length;
      return {polygon,fill,depth:depth-(index<groundFaceCount?10:0)};
    }).sort((a,b)=>a.depth-b.depth);
    for(const {polygon,fill} of projected) {
      ctx.beginPath();
      ctx.moveTo(polygon[0][0],polygon[0][1]);
      for(let i=1;i<polygon.length;i++)ctx.lineTo(polygon[i][0],polygon[i][1]);
      ctx.closePath();
      ctx.fillStyle=fill;ctx.fill();
      ctx.strokeStyle=fill;ctx.lineWidth=.56;ctx.stroke();
    }
    if(visible&&!document.hidden&&!reducedMotion.matches) requestDraw();
  }

  function requestDraw(){
    if(!frame)frame=requestAnimationFrame(render);
  }
  new ResizeObserver(()=>{
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const pixels=Math.min(devicePixelRatio||1,1.75);
    width=rect.width;height=rect.height;
    canvas.width=Math.round(width*pixels);canvas.height=Math.round(height*pixels);
    ctx.setTransform(pixels,0,0,pixels,0,0);
    requestDraw();
  }).observe(canvas);
  new IntersectionObserver(([entry])=>{
    visible=entry.isIntersecting;
    if(visible)requestDraw();
  }).observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(visible&&!document.hidden)requestDraw();});
  reducedMotion.addEventListener('change',requestDraw);
  for(const button of document.querySelectorAll('[data-garden-turn]')){
    button.addEventListener('click',()=>{
      target+=Number(button.dataset.gardenTurn)*Math.PI/4;
      requestDraw();
    });
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||drag)return;
    drag={id:event.pointerId,x:event.clientX,start:event.clientX,y:event.clientY,moved:false};
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove',event=>{
    if(drag?.id!==event.pointerId)return;
    if(!drag.moved)drag.moved=Math.hypot(event.clientX-drag.start,event.clientY-drag.y)>7;
    if(drag.moved){
      target+=(event.clientX-drag.x)*.012;
      drag.x=event.clientX;
      requestDraw();
    }
  });
  canvas.addEventListener('pointerup',event=>{
    if(drag?.id!==event.pointerId||drag.moved)return;
    const rect=canvas.getBoundingClientRect();
    const hit=targets.find(({center:[x,y],radius})=>
      Math.hypot(event.clientX-rect.left-x,event.clientY-rect.top-y)<radius);
    if(hit)section.querySelector(`[data-action="${hit.action}"]`).click();
  });
  canvas.addEventListener('lostpointercapture',()=>{
    drag=null;
    canvas.classList.remove('dragging');
  });
})();
