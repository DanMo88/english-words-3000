import re
OVR={'May':'may-month','IT':'i-t'}
def slug(w):
    if w in OVR: return OVR[w]
    s=w.replace('’',"'").replace("'",'').strip()
    s=re.sub(r'[^A-Za-z0-9]+','-',s).strip('-')
    return s if s in ('I','May','TV','OK','T-shirt') and False else s.lower()
