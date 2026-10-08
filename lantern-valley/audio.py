import numpy as np, json
from scipy.signal import fftconvolve
from scipy.io import wavfile
sr=44100; T=45.0; n=int(sr*T); tt=np.arange(n)/sr
rng=np.random.default_rng(7)
mid=lambda m: 440*2**((m-69)/12)
out=np.zeros((n,2))
def sm(a,b,x): 
    u=np.clip((x-a)/(b-a),0,1); return u*u*(3-2*u)
chords=[(0,14.6,[38,45,50,52,57]),(14.6,26.2,[35,42,47,50,54,57]),(26.2,33,[31,43,50,57,59]),(33,45.5,[38,45,50,54,57,62,66])]
swell=0.22+0.78*sm(2,34,tt)
for a,b,notes in chords:
    env=sm(a-2.2,a+2.2,tt)*(1-sm(b-2.2,b+2.2,tt))
    for i,m in enumerate(notes):
        f=mid(m)
        for det,pan in ((-0.0025,0.25),(0.0025,0.75)):
            ph=rng.random()*6.28
            lfo=1+0.25*np.sin(2*np.pi*(0.07+0.03*i)*tt+ph)
            s=(np.sin(2*np.pi*f*(1+det)*tt+ph)+0.28*np.sin(2*np.pi*2*f*(1+det)*tt)+0.1*np.sin(2*np.pi*3*f*(1+det)*tt))*lfo
            amp=0.05/(1+i*0.25)
            out[:,0]+=s*env*swell*amp*(1-pan); out[:,1]+=s*env*swell*amp*pan
# bells on each passing of the flame
scale=[62,64,66,69,71,74,76,78,81,83,86,88,90,93]
ev=json.load(open('events.json')); grid=0.15; slots={}
for t0,x,y in ev:
    k=round(t0/grid); slots.setdefault(k,[])
    if len(slots[k])<3: slots[k].append((x,y))
for k,lst in slots.items():
    for j,(x,y) in enumerate(lst):
        t0=k*grid+j*0.012; i0=int(t0*sr)
        if i0>=n: continue
        idx=int(np.clip((0.75-y)/0.35,0,0.999)*8)+int(rng.integers(0,6))
        f=mid(scale[min(idx,len(scale)-1)])
        L=min(n-i0,int(2.6*sr)); u=np.arange(L)/sr
        env=np.exp(-u/0.7)*np.minimum(1,u/0.004)
        s=(np.sin(2*np.pi*f*u)+0.3*np.sin(2*np.pi*2.005*f*u)*np.exp(-u/0.3)+0.12*np.sin(2*np.pi*3.93*f*u)*np.exp(-u/0.15))*env*0.045
        out[i0:i0+L,0]+=s*(1-x*0.8-0.1); out[i0:i0+L,1]+=s*(x*0.8+0.1)
# reverb
L=int(3.2*sr); u=np.arange(L)/sr
wet=np.zeros_like(out)
for c in range(2):
    ir=rng.standard_normal(L)*np.exp(-u/0.9); ir=np.convolve(ir,np.ones(24)/24,'same'); ir/=np.sqrt((ir**2).sum())
    wet[:,c]=fftconvolve(out[:,c],ir)[:n]
mixd=out*0.7+wet*0.55
mixd*= (sm(0,2,tt)*(1-sm(41.5,44.8,tt)))[:,None]
mixd/=np.abs(mixd).max()/0.85
wavfile.write('audio.wav',sr,(mixd*32767).astype(np.int16))
print('ok')
