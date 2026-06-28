module.exports = {
  tools: {
    kano: {
      localStorageKey: "kano-state",
      data_json: "{ title, items:[{id,name,A,O,M,I,R,Q}], sel }"
    },
    ce: {
      localStorageKey: "ce-state",
      data_json: "{ title, cols:[{id,name,imp}], rows:[{id,name}], rel:{'<row>|<col>':1|3|9} }"
    },
    qfd: {
      localStorageKey: "qfd-state",
      data_json: "{ title, reqs:[{id,name,imp,kano,cur,tgt,sp}], cols:[{id,name}], rel, roof }"
    },
    pugh: {
      localStorageKey: "pugh-state",
      data_json: "{ title, datumId, crits:[{id,name,weight}], opts:[{id,name}], cell:{'<crit>|<opt>':-2|-1|0|1|2} }"
    },
    fmea: {
      localStorageKey: "fmea-state",
      data_json: "{ title, rows:[{id,func,mode,effect,s,cause,o,control,d,action,s2,o2,d2}] }"
    },
    montecarlo: {
      localStorageKey: "montecarlo-state",
      data_json: "{ title, vars:[{id,name,dist,p,unit}], formula, target, dir }"
    }
  }
};
