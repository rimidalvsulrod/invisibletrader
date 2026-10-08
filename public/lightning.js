/*
 * lightning.js — realistic storm background (clouds + lightning) for websites.
 * No dependencies. Drop in with <script src="lightning.js"></script>, then:
 *
 *   const storm = Lightning.create({ frequency: 14, palette: 'night' });
 *   storm.strike({ type: 'cg', toX: 400, toY: 600 });   // manual strike
 *
 * Options: frequency (strikes/min), intensity, palette ('night'|'steel'|'dusk'|
 * {top,hor,cloud,lit,amb,core,mid,glow}), cover (0.3-0.95 cloud amount),
 * bolts, auto, safe (photosensitive), quality (sky render scale), ground
 * (selector: where ground strikes land), container + fixed:false (confine the
 * storm to one positioned element instead of the whole viewport), zIndex.
 *
 * Exposes CSS variables on <html> every frame so UI can react to flashes:
 *   --flash   0..1  current sky brightness from lightning
 *   --fx/--fy       position (%) of the brightest flash
 *
 * Behaviour is modelled on frame-by-frame analysis of real storm footage:
 *  - stepped leader crawls out faintly (CG ~60-150ms, crawlers 200-450ms)
 *  - return stroke: dark -> peak in one frame, holds ~25-55ms, fades ~45-90ms
 *  - 1-4 restrikes down the same channel 40-160ms apart, sometimes a
 *    continuing current that stays bright for 150-350ms
 *  - most light is cloud illumination (in-cloud flashes with no visible bolt),
 *    cloud edges facing the flash light up, the sky turns lavender
 *  - strikes cluster: long dark gaps then 2-3 in quick succession
 */
(function (global) {
  'use strict';

  const PALETTES = {
    // video 2 (night, lavender sky during flashes)
    night: { top: [0.012, 0.013, 0.032], hor: [0.05, 0.045, 0.1], cloud: [0.085, 0.08, 0.15], lit: [0.8, 0.74, 1.0], amb: [0.36, 0.32, 0.62], core: '255,255,255', mid: '218,210,255', glow: '150,128,255' },
    // video 1 (blue hour supercell)
    steel: { top: [0.02, 0.035, 0.075], hor: [0.1, 0.13, 0.22], cloud: [0.15, 0.18, 0.28], lit: [0.72, 0.82, 1.0], amb: [0.3, 0.4, 0.62], core: '255,255,255', mid: '210,226,255', glow: '120,160,255' },
    // video 1 late night / video 2 opening (pink-magenta storms)
    dusk: { top: [0.04, 0.025, 0.05], hor: [0.17, 0.08, 0.12], cloud: [0.18, 0.11, 0.17], lit: [1.0, 0.76, 0.86], amb: [0.55, 0.32, 0.45], core: '255,250,252', mid: '255,214,232', glow: '255,140,190' },
  };

  const VERT = 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}';

  const FRAG1 = `
precision highp float;
varying vec2 v;
uniform vec2 uRes; uniform float uT; uniform float uCover;
uniform vec4 uL[4];          // x, y (uv, y up), intensity, radius
uniform float uAmb;
uniform vec3 uTop, uHor, uCloud, uLit, uAmbC;

float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+1.),f.x), f.y);
}
float fbm(vec2 p){
  float s=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<6;i++){ s+=a*noise(p); p=m*p+vec2(.13,.71); a*=.5; }
  return s;
}
float fbm3(vec2 p){
  float s=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<3;i++){ s+=a*noise(p); p=m*p; a*=.5; }
  return s;
}
// cloud density: large rounded masses (low octaves dominate), slow boil + drift
float dens(vec2 p){
  vec2 w=vec2(fbm3(p*.5+vec2(0.,uT*.015)), fbm3(p*.5+vec2(5.2,1.3)-uT*.012));
  float d=fbm(p+.55*w+vec2(uT*.018,0.));
  return smoothstep(uCover, uCover+.42, d);
}
void main(){
  vec2 uv=v; float asp=uRes.x/uRes.y;
  float persp=1./(.62+uv.y*.55);              // mild perspective toward the horizon
  vec2 p=vec2((uv.x-.5)*asp*persp*3., uv.y*3.2+persp*.8);

  float d=dens(p);
  float e=.03;
  float dx=dens(p+vec2(e,0.))-d, dy=dens(p+vec2(0.,e))-d;
  vec3 n=normalize(vec3(-dx/e*.35, -dy/e*.35, 1.));

  vec3 sky=mix(uHor, uTop, smoothstep(0.,.85,uv.y));
  // idle: billow tops catch faint sky light, undersides near black
  float shade=.35+.65*clamp(n.y*1.4+.45,0.,1.);
  vec3 col=mix(sky, uCloud*shade*(.55+.6*d), smoothstep(.0,.7,d));

  float light=0.;
  for(int i=0;i<4;i++){
    vec4 L=uL[i];
    if(L.z<.001) continue;
    vec2 dv=vec2((L.x-uv.x)*asp, L.y-uv.y);
    float d2=dot(dv,dv), r=L.w, dl=sqrt(d2);
    float fall=exp(-d2/(r*r)) + .18*exp(-dl/(r*2.));
    vec3 ld=normalize(vec3(dv,.15));
    float facing=max(dot(n,ld),0.);
    float occ=1.;
    if(i==0){ // self-shadowing toward the brightest flash: true volumetric look
      vec2 sd=vec2(dv.x/asp, dv.y)/max(dl,.001);
      sd=vec2(sd.x*asp*persp*3., sd.y*3.2);
      float o=dens(p+sd*.06)+dens(p+sd*.16);
      occ=exp(-o*.9*smoothstep(.0,.12,dl));
    }
    float through=(1.-d)*.45;                 // gaps / thin cloud glow
    float rim=facing*d*1.5;                   // billows facing the flash
    float body=d*(1.-d)*1.4;
    light+=L.z*fall*occ*(through+rim+body+.1);
  }
  col+=uLit*light;
  col+=uAmbC*uAmb*(.25+.75*mix(1.,d,.75))*(.5+.5*uv.y);

  col*=.7+.3*smoothstep(1.25,.25,length((uv-vec2(.5,.62))*vec2(1.,1.3)));
  col=1.-exp(-col*1.25);
  col+=(hash(gl_FragCoord.xy+fract(uT))-.5)/200.;
  gl_FragColor=vec4(col,1.);
}`;


  // ---------- WebGL2 volumetric clouds ----------
  const VERT2 = '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

  // one-time: bake a tileable 64^3 noise volume (perlin-worley shape + worley detail)
  const NOISE2 = `#version 300 es
precision highp float;
uniform float uZ; out vec4 o;
vec3 h3(vec3 p){ p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453); }
float worley(vec3 p,float f){
  p*=f; vec3 id=floor(p), fr=fract(p); float md=1.;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){
    vec3 c=vec3(x,y,z); md=min(md,length(c+h3(mod(id+c,f))-fr));
  }
  return 1.-md;
}
float grad(vec3 i,vec3 f,vec3 c,float per){ return dot(h3(mod(i+c,per))*2.-1., f-c); }
float perlin(vec3 p,float per){
  p*=per; vec3 i=floor(p), f=fract(p), u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(mix(grad(i,f,vec3(0,0,0),per),grad(i,f,vec3(1,0,0),per),u.x),
                 mix(grad(i,f,vec3(0,1,0),per),grad(i,f,vec3(1,1,0),per),u.x),u.y),
             mix(mix(grad(i,f,vec3(0,0,1),per),grad(i,f,vec3(1,0,1),per),u.x),
                 mix(grad(i,f,vec3(0,1,1),per),grad(i,f,vec3(1,1,1),per),u.x),u.y),u.z);
}
void main(){
  vec3 p=vec3(gl_FragCoord.xy/64.,uZ);
  float pf=clamp((perlin(p,4.)*.5+perlin(p,8.)*.25+perlin(p,16.)*.125)*.9+.5,0.,1.);
  float w1=worley(p,4.)*.625+worley(p,8.)*.25+worley(p,16.)*.125;
  float w2=worley(p,8.)*.625+worley(p,16.)*.25+worley(p,32.)*.125;
  float pw=clamp(w1+pf*(1.-w1)-.35*(1.-pf),0.,1.); // perlin-worley: puffy but connected
  o=vec4(pw,w1,w2,1.);
}`;

  const FRAG2 = `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler3D uN;
uniform vec2 uRes; uniform float uT, uCover, uSteps;
uniform vec4 uL[4]; uniform float uAmb;
uniform vec3 uTop, uHor, uCloud, uLit, uAmbC;
out vec4 frag;
const float BASE=1.0, TOP=3.8, PITCH=.5, TANF=.62;
float remap(float v,float a,float b,float c,float d){ return c+(v-a)*(d-c)/(b-a); }
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec3 ray(vec2 uv){
  float asp=uRes.x/uRes.y;
  vec3 d=normalize(vec3((uv.x-.5)*asp*TANF*2.,(uv.y-.5)*TANF*2.,1.));
  float c=cos(PITCH), s=sin(PITCH);
  return vec3(d.x, d.y*c+d.z*s, -d.y*s+d.z*c);
}
vec3 wind(){ return vec3(uT*.035, 0., uT*.012); }
float density(vec3 p, bool fine){
  float h=(p.y-BASE)/(TOP-BASE);
  if(h<0.||h>1.) return 0.;
  vec3 w=wind();
  float wm=texture(uN, vec3((p.xz+w.xz)*.035, .37)).g;          // weather map: towers vs gaps
  float top=mix(.35,1.,smoothstep(.35,.75,wm));
  float hg=smoothstep(0.,.05,h)*smoothstep(top,top*.5,h);       // flat dark base, rounded tops
  vec4 n=texture(uN,(p+w)*.15+vec3(0.,uT*.004,0.));
  float s=n.r*.65+n.g*.35;
  float cov=clamp(uCover*(.75+.6*wm),0.,1.);
  float d=clamp(remap(s*hg,1.-cov,1.,0.,1.),0.,1.);
  if(d<=0.||!fine) return d;
  float dn=texture(uN,(p+w*1.3)*.7).b*.7+texture(uN,(p+w*1.6)*1.9).b*.3;                          // billow erosion = fluffy edges
  return clamp(remap(d,(1.-dn)*mix(.55,.3,h),1.,0.,1.)*1.6,0.,1.);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  vec3 rd=ray(uv);
  float up=max(rd.y,0.);
  vec3 sky=mix(uHor,uTop,smoothstep(0.,.55,up))+uAmbC*uAmb*.45;
  vec3 LP[4]; float LI[4], LR[4];
  for(int i=0;i<4;i++){
    vec3 r=ray(uL[i].xy); float ry=max(r.y,.06);
    LP[i]=r*((BASE+.5)/ry); LI[i]=uL[i].z; LR[i]=uL[i].w*8.;
  }
  vec3 acc=vec3(0); float T=1., tHit=-1.;
  if(rd.y>.015){
    float t0=BASE/rd.y, t1=min(min(TOP/rd.y,t0+12.),80.);
    if(t0<80.){
      float ign=fract(52.9829189*fract(dot(gl_FragCoord.xy+fract(uT*7.)*vec2(47.,17.),vec2(.06711056,.00583715))));
      float dt=(t1-t0)/uSteps, t=t0+dt*ign;
      for(int i=0;i<96;i++){
        if(float(i)>=uSteps||T<.02) break;
        vec3 p=rd*t;
        float d=density(p,true);
        if(d>.002){
          if(tHit<0.) tHit=t;
          float h=clamp((p.y-BASE)/(TOP-BASE),0.,1.);
          vec3 amb=uCloud*2.4*(.22+1.6*h*h+.4*h)+uAmbC*uAmb*(.35+h);
          vec3 lit=vec3(0);
          for(int k=0;k<4;k++){
            if(LI[k]<.001) continue;
            vec3 dl=LP[k]-p; float dd=dot(dl,dl), R2=LR[k]*LR[k];
            float att=LI[k]*R2/(R2+dd*2.5);
            if(att<.004) continue;
            float od;
            if(k==0){
              float L=sqrt(dd); vec3 ld=dl/L; float ls=min(L,2.4)*.25; od=0.;
              for(int j=1;j<=4;j++) od+=density(p+ld*ls*float(j),false);
              od*=ls;
            } else od=d*.6;
            lit+=uLit*att*(exp(-od*4.5)*.8+exp(-od*.9)*.2);        // direct + multiple scattering
          }
          float Tr=exp(-d*9.*dt);
          acc+=T*(amb+lit*4.)*(1.-Tr);
          T*=Tr;
        }
        t+=dt;
      }
    }
  }
  vec3 col=sky*T+acc;
  if(tHit>0.) col=mix(col,sky,smoothstep(14.,70.,tHit)*.9);   // aerial perspective
  col*=.78+.22*smoothstep(1.25,.25,length((uv-vec2(.5,.6))*vec2(1.,1.3)));
  col=1.-exp(-col*1.3);
  col+=(hash(gl_FragCoord.xy+fract(uT))-.5)/200.;
  frag=vec4(col,1.);
}`;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.73;
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  // ---------- channel geometry ----------
  function grow(o) {
    let x = o.x, y = o.y, h = o.heading, d = 0, base = o.heading;
    const d0 = o.d0 || 0, pts = [x, y], dist = [d0];
    while (d < o.len) {
      if (o.tx != null) base = Math.atan2(o.ty - y, o.tx - x);
      h += gauss() * o.wander;
      h += angDiff(base, h) * o.pull;
      const a = h + gauss() * o.jitter, s = o.step * rnd(0.35, 1.45);
      x += Math.cos(a) * s; y += Math.sin(a) * s; d += s;
      pts.push(x, y); dist.push(d0 + d);
      if (o.stopY != null && y >= o.stopY) break;
      if (o.tx != null && Math.hypot(o.tx - x, o.ty - y) < o.step * 1.2) { pts.push(o.tx, o.ty); dist.push(d0 + d + o.step); break; }
    }
    return { pts, dist };
  }

  function branch(chs, parent, cfg, depth) {
    const n = parent.pts.length / 2;
    for (let i = 2; i < n - 3; i++) {
      if (chs.length > cfg.max) return;
      if (Math.random() > cfg.prob * Math.pow(cfg.falloff, depth - 1)) continue;
      const P = parent.pts, px = P[i * 2], py = P[i * 2 + 1];
      const segH = Math.atan2(P[i * 2 + 3] - py, P[i * 2 + 2] - px);
      let h = segH + (Math.random() < 0.5 ? -1 : 1) * rnd(0.3, 1.1);
      if (cfg.down && Math.sin(h) < 0) h = -h;
      const remaining = parent.dist[n - 1] - parent.dist[i];
      const len = Math.min(cfg.maxLen, Math.max(15, remaining * rnd(0.12, 0.5) * (depth === 1 ? 1 : 0.65)));
      const c = grow({ x: px, y: py, heading: h, len, step: cfg.step * 0.8, wander: cfg.wander * 1.4, jitter: cfg.jitter, pull: 0.04, d0: parent.dist[i], stopY: cfg.stopY });
      c.w = parent.w * rnd(0.32, 0.55); c.a = parent.a * rnd(0.4, 0.7); c.depth = depth;
      chs.push(c);
      if (depth < cfg.maxDepth) branch(chs, c, cfg, depth + 1);
    }
  }

  function buildCG(x0, y0, x1, y1, s) {
    const cfg = { step: 7 * s + 2, wander: 0.1, jitter: 0.5, prob: 0.07, falloff: 0.5, maxDepth: 3, down: true, stopY: y1, maxLen: 500 * s, max: 70 };
    const main = grow({ x: x0, y: y0, tx: x1, ty: y1, heading: Math.PI / 2, len: Math.hypot(x1 - x0, y1 - y0) * 3, step: cfg.step, wander: cfg.wander, jitter: cfg.jitter, pull: 0.12 });
    main.w = 2.2 * s + 0.6; main.a = 1; main.depth = 0;
    const chs = [main];
    branch(chs, main, cfg, 1);
    return chs;
  }

  function buildCrawler(x0, y0, W, s) {
    const cfg = { step: 6 * s + 2, wander: 0.16, jitter: 0.55, prob: 0.11, falloff: 0.6, maxDepth: 3, down: false, stopY: null, maxLen: 380 * s, max: 90 };
    const dir = Math.random() < 0.5 ? 0 : Math.PI;
    const chs = [];
    const mk = (h, len) => {
      const m = grow({ x: x0, y: y0, heading: h, len, step: cfg.step, wander: cfg.wander, jitter: cfg.jitter, pull: 0.035 });
      m.w = 1.5 * s + 0.4; m.a = 0.9; m.depth = 0; chs.push(m); branch(chs, m, cfg, 1);
    };
    mk(dir + rnd(-0.25, 0.25), W * rnd(0.35, 0.8) * (0.6 + s * 0.4));
    if (Math.random() < 0.55) mk(dir + Math.PI + rnd(-0.3, 0.3), W * rnd(0.15, 0.45) * s); // spider: spreads both ways
    return chs;
  }

  // ---------- pre-render a bolt once, reuse every frame ----------
  function renderBolt(chs, pal, s, dpr, ground) {
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const c of chs) for (let i = 0; i < c.pts.length; i += 2) {
      const x = c.pts[i], y = c.pts[i + 1];
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    const pad = 50;
    const cw = maxx - minx + pad * 2, chh = maxy - miny + pad * 2;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(cw * dpr); cv.height = Math.ceil(chh * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr); g.translate(pad - minx, pad - miny);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = g.lineJoin = 'round';
    // halo, glow, coloured sheath, white-hot core
    const passes = [[16, 0.02, pal.glow], [7, 0.06, pal.glow], [3, 0.3, pal.mid], [1.15, 0.95, pal.core]];
    const seed = Math.random() * 100;
    for (const c of chs) {
      const n = c.pts.length / 2, chunk = 4;
      for (let k = 0; k < n - 1; k += chunk) {
        const t = k / n;
        // branches taper and fade toward their tips; segments randomly dip as
        // if passing behind cloud (occlusion seen constantly in the footage)
        const occ = 0.55 + 0.45 * Math.sin(seed + k * 0.09 + c.depth * 3) * Math.sin(seed * 1.7 + k * 0.031);
        let alpha = c.a * (c.depth ? Math.pow(1 - t, 0.8) : 1) * (c.depth ? 1 : Math.min(1, 0.35 + occ));
        if (c.depth === 0 && t < 0.08) alpha *= t / 0.08; // emerges out of the cloud base
        const w = c.w * (c.depth ? 1 - 0.6 * t : 1);
        g.beginPath();
        g.moveTo(c.pts[k * 2], c.pts[k * 2 + 1]);
        for (let j = k + 1; j <= Math.min(n - 1, k + chunk); j++) g.lineTo(c.pts[j * 2], c.pts[j * 2 + 1]);
        for (const [pw, pa, col] of passes) {
          if (c.depth > 1 && pw > 10) continue;
          g.lineWidth = pw * w; g.strokeStyle = `rgba(${col},${pa * alpha})`; g.stroke();
        }
      }
    }
    if (ground) { // attachment point bloom
      const m = chs[0], ex = m.pts[m.pts.length - 2], ey = m.pts[m.pts.length - 1], r = 70 * s;
      const gr = g.createRadialGradient(ex, ey, 0, ex, ey, r);
      gr.addColorStop(0, `rgba(${pal.core},.55)`); gr.addColorStop(0.25, `rgba(${pal.mid},.18)`); gr.addColorStop(1, `rgba(${pal.glow},0)`);
      g.fillStyle = gr; g.fillRect(ex - r, ey - r, r * 2, r * 2);
    }
    return { cv, x: minx - pad, y: miny - pad, w: cw, h: chh };
  }

  function makeStrokes(safe, type) {
    if (safe) return [{ t: 0, peak: 1, hold: 120, decay: 420, dx: 0, dy: 0 }];
    const r = Math.random();
    const n = r < 0.35 ? 1 : r < 0.65 ? 2 : r < 0.85 ? 3 : 4;
    const out = []; let t = 0;
    for (let i = 0; i < n; i++) {
      const cont = Math.random() < (type === 'cg' ? 0.2 : 0.12);
      out.push({ t, peak: i ? rnd(0.45, 0.95) : 1, hold: cont ? rnd(150, 350) : rnd(25, 55), decay: rnd(45, 90), dx: gauss() * 0.03, dy: gauss() * 0.02 });
      t += out[i].hold + rnd(40, 160);
    }
    return out;
  }

  function envelope(st, t) {
    if (t < st.leader) return { I: 0.03 * (t / st.leader), B: 0, lp: t / st.leader, q: st.strokes[0] };
    t -= st.leader;
    let I = 0, B = 0, q = st.strokes[0];
    for (const s of st.strokes) {
      const dt = t - s.t; if (dt < 0) continue;
      q = s;
      const inHold = dt < s.hold;
      I = Math.max(I, inHold ? s.peak * (1 - 0.12 * Math.random()) : s.peak * Math.exp(-(dt - s.hold) / s.decay));
      B = Math.max(B, inHold ? s.peak : s.peak * Math.exp(-(dt - s.hold) / (s.decay * 1.7)));
    }
    const last = st.strokes[st.strokes.length - 1];
    return { I, B, lp: 1, q, done: t > last.t + last.hold + last.decay * 8 };
  }

  // ---------- Storm ----------
  class Storm {
    constructor(opts) {
      const reduce = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.o = Object.assign({
        container: document.body, frequency: 14, intensity: 1, palette: 'night', bolts: true, auto: true,
        fixed: true, quality: 0.5, cover: 0.72, safe: reduce, ground: null, zIndex: -1,
        mix: { cloud: 0.45, cg: 0.3, crawler: 0.25 },
      }, opts);
      if (typeof this.o.container === 'string') this.o.container = document.querySelector(this.o.container);
      this.strikes = []; this.queue = [];
      this.lastVars = '';
      this._build();
      this._setLit();
      this._schedule(performance.now());
      this._loop = this._loop.bind(this);
      this._onResize = () => this._resize();
      addEventListener('resize', this._onResize);
      if (!this.o.fixed && global.ResizeObserver) { this.ro = new ResizeObserver(this._onResize); this.ro.observe(this.o.container); }
      this.raf = requestAnimationFrame(this._loop);
    }

    _build() {
      const wrap = this.wrap = document.createElement('div');
      wrap.setAttribute('aria-hidden', 'true');
      wrap.style.cssText = `position:${this.o.fixed ? 'fixed' : 'absolute'};inset:0;z-index:${this.o.zIndex};pointer-events:none;isolation:isolate;overflow:hidden;background:#05060d`;
      const sky = this.sky = document.createElement('canvas');
      const fx = this.fx = document.createElement('canvas');
      sky.style.cssText = fx.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      fx.style.mixBlendMode = 'screen';
      wrap.append(sky, fx);
      this.o.container.prepend(wrap);
      this.ctx = fx.getContext('2d');
      this._initGL();
      this._resize();
    }

    _initGL() {
      const opts = { antialias: false, alpha: false, powerPreference: 'high-performance' };
      const gl2 = this.sky.getContext('webgl2', Object.assign({ preserveDrawingBuffer: true }, opts));
      if (gl2) {
        try { this._initGL2(gl2); return; } catch (e) { console.warn('lightning: webgl2 clouds failed, falling back', e); }
        const c = document.createElement('canvas'); c.style.cssText = this.sky.style.cssText; this.sky.replaceWith(c); this.sky = c;
      }
      const gl = this.gl = this.sky.getContext('webgl', opts);
      if (!gl) return;
      this.pr = this._program(gl, VERT, FRAG1);
      this._quad(gl); this._uniforms(gl);
    }

    _program(gl, vs, fs) {
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(pr, 0, 'a');
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      return pr;
    }

    _quad(gl) {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }

    _uniforms(gl) {
      gl.useProgram(this.pr);
      this.u = {};
      for (const k of ['uRes', 'uT', 'uCover', 'uSteps', 'uL', 'uAmb', 'uTop', 'uHor', 'uCloud', 'uLit', 'uAmbC', 'uN']) this.u[k] = gl.getUniformLocation(this.pr, k);
    }

    _initGL2(gl) {
      this._quad(gl);
      const S = 64, noise = this._program(gl, VERT2, NOISE2);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.texStorage3D(gl.TEXTURE_3D, 7, gl.RGBA8, S, S, S);
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.useProgram(noise); gl.viewport(0, 0, S, S);
      const uZ = gl.getUniformLocation(noise, 'uZ');
      for (let z = 0; z < S; z++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, z);
        gl.uniform1f(uZ, (z + 0.5) / S);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb); gl.deleteProgram(noise);
      gl.generateMipmap(gl.TEXTURE_3D);
      this.pr = this._program(gl, VERT2, FRAG2);
      this._uniforms(gl);
      gl.uniform1i(this.u.uN, 0);
      // temporal smoothing: blend 70% new frame over previous -> kills raymarch grain
      gl.enable(gl.BLEND); gl.blendColor(0, 0, 0, 0.7); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      this.gl = gl; this.vol = true;
    }

    _resize() {
      const dpr = this.dpr = Math.min(devicePixelRatio || 1, 1.5);
      const c = this.o.container;
      this.w = this.o.fixed ? innerWidth : c.clientWidth; this.h = this.o.fixed ? innerHeight : c.clientHeight;
      const q = this.o.quality * (this.w < 700 ? 0.8 : 1);
      this.sky.width = Math.max(2, Math.round(this.w * q)); this.sky.height = Math.max(2, Math.round(this.h * q));
      this.fx.width = Math.round(this.w * dpr); this.fx.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.gl) this.gl.viewport(0, 0, this.sky.width, this.sky.height);
      this.frame = 0;
    }

    _schedule(now) {
      const mean = 60000 / Math.max(0.1, this.o.frequency);
      this.next = now - Math.log(1 - Math.random()) * mean + 300;
    }

    /** viewport-px -> engine coords (only differs when fixed:false) */
    offsetTop() { return this.o.fixed ? 0 : this.wrap.getBoundingClientRect().top; }
    toLocal(x, y) { if (this.o.fixed) return [x, y]; const r = this.wrap.getBoundingClientRect(); return [x - r.left, y - r.top]; }

    groundY() {
      const g = this.o.ground;
      const el = typeof g === 'string' ? document.querySelector(g) : g;
      if (el) { const r = el.getBoundingClientRect(), top = r.top - this.offsetTop(); if (top < this.h && top + r.height > 0) return top + r.height * 0.35; }
      return this.h * rnd(1.0, 1.1); // off-screen: bolt runs off the bottom
    }

    /** Fire a strike. type: 'cg' | 'crawler' | 'cloud'. Coords in CSS px (viewport). */
    strike(o = {}) {
      const W = this.w, H = this.h, safe = this.o.safe;
      let type = o.type;
      if (!type) { const m = this.o.mix, r = Math.random() * (m.cloud + m.cg + m.crawler); type = r < m.cloud ? 'cloud' : r < m.cloud + m.cg ? 'cg' : 'crawler'; }
      const s = o.scale || rnd(0.55, 1);
      const pal = this._pal();
      const st = { type, s, t0: performance.now(), strokes: makeStrokes(safe, type), leader: 0, bolt: null, chs: null };
      let lx, ly, r;
      if (type === 'cg') {
        const x1 = o.toX != null ? o.toX : rnd(0.08, 0.92) * W, y1 = o.toY != null ? o.toY : this.groundY();
        const x0 = o.x != null ? o.x : x1 + rnd(-0.18, 0.18) * W, y0 = o.y != null ? o.y : rnd(-0.02, 0.2) * H;
        st.chs = buildCG(x0, y0, x1, y1, s);
        st.leader = safe ? 0 : rnd(60, 150);
        lx = x0; ly = y0 + (y1 - y0) * 0.12; r = 0.55 * s + 0.15; st.k = 1;
        st.bolt = renderBolt(st.chs, pal, s, this.dpr, o.toY == null || o.toY > H * 0.5 || o.bloom);
      } else if (type === 'crawler') {
        const x0 = o.x != null ? o.x : rnd(0.1, 0.9) * W, y0 = o.y != null ? o.y : rnd(0.06, 0.4) * H;
        st.chs = buildCrawler(x0, y0, W, s);
        st.leader = safe ? 0 : rnd(200, 450);
        const m = st.chs[0], mi = Math.floor(m.pts.length / 4) * 2;
        lx = m.pts[mi]; ly = m.pts[mi + 1]; r = 0.7 * s + 0.2; st.k = 0.9;
        st.bolt = renderBolt(st.chs, pal, s, this.dpr, false);
      } else { // in-cloud flash: no visible channel, only illumination
        lx = o.x != null ? o.x : rnd(0.05, 0.95) * W; ly = o.y != null ? o.y : rnd(0.08, 0.5) * H;
        r = rnd(0.25, 0.55) * (0.6 + s * 0.4); st.k = rnd(0.6, 1.15);
      }
      st.lx = lx / W; st.ly = 1 - ly / H; st.r = r;
      // total stroke time for the leader-free part; useful for thunder timing etc.
      dispatchEvent(new CustomEvent('lightning', { detail: { type, x: lx, y: ly, scale: s, delay: st.leader } }));
      this.strikes.push(st);
      if (this.strikes.length > 8) this.strikes.shift();
      return st;
    }

    _pal() {
      const p = this.o.palette;
      return typeof p === 'object' ? Object.assign({}, PALETTES.night, p) : PALETTES[p] || PALETTES.night;
    }

    _setLit() { document.documentElement.style.setProperty('--lit', this._pal().mid); }

    set(opts) {
      Object.assign(this.o, opts);
      if ('frequency' in opts) this._schedule(performance.now());
      if ('quality' in opts) this._resize();
      if ('palette' in opts) this._setLit();
    }

    _drawLeader(st, p) {
      const ctx = this.ctx, pal = this._pal();
      let maxD = 0; for (const c of st.chs) maxD = Math.max(maxD, c.dist[c.dist.length - 1]);
      const D = maxD * p, flick = rnd(0.5, 1);
      ctx.lineCap = ctx.lineJoin = 'round';
      for (const c of st.chs) {
        if (c.dist[0] > D) continue;
        ctx.beginPath(); ctx.moveTo(c.pts[0], c.pts[1]);
        for (let i = 1; i < c.dist.length && c.dist[i] <= D; i++) ctx.lineTo(c.pts[i * 2], c.pts[i * 2 + 1]);
        const a = (c.depth ? 0.5 : 1) * flick;
        ctx.lineWidth = 5 * st.s; ctx.strokeStyle = `rgba(${pal.glow},${0.06 * a})`; ctx.stroke();
        ctx.lineWidth = 1.1; ctx.strokeStyle = `rgba(${pal.mid},${0.32 * a})`; ctx.stroke();
      }
    }

    _loop(now) {
      this.raf = requestAnimationFrame(this._loop);
      if (document.hidden) { this.next = Math.max(this.next, now + 1000); return; }

      if (this.o.auto && now >= this.next) {
        this.strike();
        if (Math.random() < 0.35) { // clusters: 1-2 follow-ups shortly after
          const k = Math.random() < 0.6 ? 1 : 2;
          for (let i = 0; i < k; i++) this.queue.push(now + rnd(250, 1500) * (i + 1));
        }
        this._schedule(now);
      }
      this.queue = this.queue.filter((t) => (t <= now ? (this.strike(), false) : true));

      const ctx = this.ctx, W = this.w, H = this.h;
      const cap = this.o.safe ? 0.35 : 1.4;
      if (this.dirty) { ctx.clearRect(0, 0, W, H); this.dirty = false; }
      ctx.globalCompositeOperation = 'lighter';
      const lights = []; let amb = 0;
      this.strikes = this.strikes.filter((st) => {
        const e = envelope(st, now - st.t0);
        if (e.done) return false;
        const I = Math.min(cap, e.I * this.o.intensity * st.s * st.k);
        lights.push([st.lx + e.q.dx, st.ly + e.q.dy, I, st.r]);
        amb += I * (st.type === 'cloud' ? 0.08 : 0.16);
        if (this.o.bolts && st.chs) {
          if (e.lp < 1) { this._drawLeader(st, e.lp); this.dirty = true; }
          else if (e.B > 0.004) {
            const b = st.bolt; ctx.globalAlpha = Math.min(1, e.B * (this.o.safe ? 0.6 : 1));
            ctx.drawImage(b.cv, b.x, b.y, b.w, b.h); ctx.globalAlpha = 1; this.dirty = true;
          }
        }
        return true;
      });
      lights.sort((a, b) => b[2] - a[2]);
      amb = Math.min(this.o.safe ? 0.2 : 0.9, amb);

      // sky: full rate while flashing, half rate when calm (clouds drift slowly)
      const active = lights.length > 0;
      if (active || this.frame++ % 2 === 0 || this.wasActive) this._renderSky(now, lights, amb);
      this.wasActive = active;

      const top = lights[0];
      const F = Math.min(1, (top ? top[2] : 0) * 0.75 + amb * 0.4);
      const vars = F.toFixed(3) + (top ? `|${(top[0] * 100).toFixed(1)}|${((1 - top[1]) * 100).toFixed(1)}` : '');
      if (vars !== this.lastVars) {
        this.lastVars = vars;
        const rs = document.documentElement.style;
        rs.setProperty('--flash', F.toFixed(3));
        if (top) { rs.setProperty('--fx', (top[0] * 100).toFixed(1) + '%'); rs.setProperty('--fy', ((1 - top[1]) * 100).toFixed(1) + '%'); }
      }
    }

    _renderSky(now, lights, amb) {
      const pal = this._pal();
      const gl = this.gl;
      if (!gl) { // 2D fallback: gradient + radial glows
        const g = this.sky.getContext('2d'), w = this.sky.width, h = this.sky.height;
        const c = (a, m = 1) => `rgb(${a.map((x) => Math.min(255, x * 255 * m) | 0)})`;
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, c(pal.top)); gr.addColorStop(1, c(pal.hor, 1 + amb * 2));
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (const L of lights) {
          const x = L[0] * w, y = (1 - L[1]) * h, r = L[3] * h;
          const rg = g.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, `rgba(${pal.mid},${Math.min(1, L[2] * 0.6)})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = rg; g.fillRect(0, 0, w, h);
        }
        return;
      }
      const u = this.u, L = new Float32Array(16);
      for (let i = 0; i < 4 && i < lights.length; i++) L.set(lights[i], i * 4);
      gl.uniform2f(u.uRes, this.sky.width, this.sky.height);
      gl.uniform1f(u.uT, now / 1000);
      gl.uniform1f(u.uCover, this.vol ? this.o.cover : 1 - this.o.cover);
      gl.uniform1f(u.uSteps, this.w < 700 ? 40 : 72);
      gl.uniform4fv(u.uL, L);
      gl.uniform1f(u.uAmb, amb);
      gl.uniform3fv(u.uTop, pal.top); gl.uniform3fv(u.uHor, pal.hor); gl.uniform3fv(u.uCloud, pal.cloud);
      gl.uniform3fv(u.uLit, pal.lit); gl.uniform3fv(u.uAmbC, pal.amb);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    destroy() {
      cancelAnimationFrame(this.raf);
      removeEventListener('resize', this._onResize);
      if (this.ro) this.ro.disconnect();
      this.wrap.remove();
    }
  }

  global.Lightning = { create: (o) => new Storm(o), palettes: PALETTES };
  if (typeof module === 'object' && module.exports) module.exports = global.Lightning;
})(window);
