var cptable = {version:"1.11.0"};
/* cputils.js (C) 2013-present SheetJS -- http://sheetjs.com */
/* vim: set ft=javascript: */
/*jshint newcap: false */
(function(root, factory) {
  "use strict";
  if(typeof cptable === "undefined") {
    if(typeof require !== "undefined"){
      var cpt = require('./cptable');
      if (typeof module !== 'undefined' && module.exports && typeof DO_NOT_EXPORT_CODEPAGE === 'undefined') module.exports = factory(cpt);
      else root.cptable = factory(cpt);
    } else throw new Error("cptable not found");
  } else cptable = factory(cptable);
}(this, function(cpt){
  "use strict";
  var magic = {
    "1200":"utf16le",
    "1201":"utf16be",
    "12000":"utf32le",
    "12001":"utf32be",
    "16969":"utf64le",
    "20127":"ascii",
    "65000":"utf7",
    "65001":"utf8"
  };

  var sbcs_cache = [874,1250,1251,1252,1253,1254,1255,1256,10000];
  var dbcs_cache = [932,936,949,950];
  var magic_cache = [65001];
  var magic_decode = {};
  var magic_encode = {};
  var cpdcache = {};
  var cpecache = {};

  var sfcc = function sfcc(x) { return String.fromCharCode(x); };
  var cca = function cca(x) { return x.charCodeAt(0); };

  var has_buf = (typeof Buffer !== 'undefined');
  if(has_buf) {
    var mdl = 1024, mdb = new Buffer(mdl);
    var make_EE = function make_EE(E){
      var EE = new Buffer(65536);
      for(var i = 0; i < 65536;++i) EE[i] = 0;
      var keys = Object.keys(E), len = keys.length;
      for(var ee = 0, e = keys[ee]; ee < len; ++ee) {
        if(!(e = keys[ee])) continue;
        EE[e.charCodeAt(0)] = E[e];
      }
      return EE;
    };
    var sbcs_encode = function make_sbcs_encode(cp) {
      var EE = make_EE(cpt[cp].enc);
      return function sbcs_e(data, ofmt) {
        var len = data.length;
        var out, i=0, j=0, D=0, w=0;
        if(typeof data === 'string') {
          out = new Buffer(len);
          for(i = 0; i < len; ++i) out[i] = EE[data.charCodeAt(i)];
        } else if(Buffer.isBuffer(data)) {
          out = new Buffer(2*len);
          j = 0;
          for(i = 0; i < len; ++i) {
            D = data[i];
            if(D < 128) out[j++] = EE[D];
            else if(D < 224) { out[j++] = EE[((D&31)<<6)+(data[i+1]&63)]; ++i; }
            else if(D < 240) { out[j++] = EE[((D&15)<<12)+((data[i+1]&63)<<6)+(data[i+2]&63)]; i+=2; }
            else {
              w = ((D&7)<<18)+((data[i+1]&63)<<12)+((data[i+2]&63)<<6)+(data[i+3]&63); i+=3;
              if(w < 65536) out[j++] = EE[w];
              else { w -= 65536; out[j++] = EE[0xD800 + ((w>>10)&1023)]; out[j++] = EE[0xDC00 + (w&1023)]; }
            }
          }
          out = out.slice(0,j);
        } else {
          out = new Buffer(len);
          for(i = 0; i < len; ++i) out[i] = EE[data[i].charCodeAt(0)];
        }
        if(!ofmt || ofmt === 'buf') return out;
        if(ofmt !== 'arr') return out.toString('binary');
        return [].slice.call(out);
      };
    };
    var sbcs_decode = function make_sbcs_decode(cp) {
      var D = cpt[cp].dec;
      var DD = new Buffer(131072), d=0, c="";
      for(d=0;d<D.length;++d) {
        if(!(c=D[d])) continue;
        var w = c.charCodeAt(0);
        DD[2*d] = w&255; DD[2*d+1] = w>>8;
      }
      return function sbcs_d(data) {
        var len = data.length, i=0, j=0;
        if(2 * len > mdl) { mdl = 2 * len; mdb = new Buffer(mdl); }
        if(Buffer.isBuffer(data)) {
          for(i = 0; i < len; i++) {
            j = 2*data[i];
            mdb[2*i] = DD[j]; mdb[2*i+1] = DD[j+1];
          }
        } else if(typeof data === "string") {
          for(i = 0; i < len; i++) {
            j = 2*data.charCodeAt(i);
            mdb[2*i] = DD[j]; mdb[2*i+1] = DD[j+1];
          }
        } else {
          for(i = 0; i < len; i++) {
            j = 2*data[i];
            mdb[2*i] = DD[j]; mdb[2*i+1] = DD[j+1];
          }
        }
        return mdb.slice(0, 2 * len).toString('ucs2');
      };
    };
    var dbcs_encode = function make_dbcs_encode(cp) {
      var E = cpt[cp].enc;
      var EE = new Buffer(131072);
      for(var i = 0; i < 131072; ++i) EE[i] = 0;
      var keys = Object.keys(E);
      for(var ee = 0, e = keys[ee]; ee < keys.length; ++ee) {
        if(!(e = keys[ee])) continue;
        var f = e.charCodeAt(0);
        EE[2*f] = E[e] & 255; EE[2*f+1] = E[e]>>8;
      }
      return function dbcs_e(data, ofmt) {
        var len = data.length, out = new Buffer(2*len), i=0, j=0, jj=0, k=0, D=0;
        if(typeof data === 'string') {
          for(i = k = 0; i < len; ++i) {
            j = data.charCodeAt(i)*2;
            out[k++] = EE[j+1] || EE[j]; if(EE[j+1] > 0) out[k++] = EE[j];
          }
          out = out.slice(0,k);
        } else if(Buffer.isBuffer(data)) {
          for(i = k = 0; i < len; ++i) {
            D = data[i];
            if(D < 128) j = D;
            else if(D < 224) { j = ((D&31)<<6)+(data[i+1]&63); ++i; }
            else if(D < 240) { j = ((D&15)<<12)+((data[i+1]&63)<<6)+(data[i+2]&63); i+=2; }
            else { j = ((D&7)<<18)+((data[i+1]&63)<<12)+((data[i+2]&63)<<6)+(data[i+3]&63); i+=3; }
            if(j<65536) { j*=2; out[k++] = EE[j+1] || EE[j]; if(EE[j+1] > 0) out[k++] = EE[j]; }
            else { jj = j-65536;
              j=2*(0xD800 + ((jj>>10)&1023)); out[k++] = EE[j+1] || EE[j]; if(EE[j+1] > 0) out[k++] = EE[j];
              j=2*(0xDC00 + (jj&1023)); out[k++] = EE[j+1] || EE[j]; if(EE[j+1] > 0) out[k++] = EE[j];
            }
          }
          out = out.slice(0,k);
        } else {
          for(i = k = 0; i < len; i++) {
            j = data[i].charCodeAt(0)*2;
            out[k++] = EE[j+1] || EE[j]; if(EE[j+1] > 0) out[k++] = EE[j];
          }
        }
        if(!ofmt || ofmt === 'buf') return out;
        if(ofmt !== 'arr') return out.toString('binary');
        return [].slice.call(out);
      };
    };
    var dbcs_decode = function make_dbcs_decode(cp) {
      var D = cpt[cp].dec;
      var DD = new Buffer(131072), d=0, c, w=0, j=0, i=0;
      for(i = 0; i < 65536; ++i) { DD[2*i] = 0xFF; DD[2*i+1] = 0xFD;}
      for(d = 0; d < D.length; ++d) {
        if(!(c=D[d])) continue;
        w = c.charCodeAt(0);
        j = 2*d;
        DD[j] = w&255; DD[j+1] = w>>8;
      }
      return function dbcs_d(data) {
        var len = data.length, out = new Buffer(2*len), i=0, j=0, k=0;
        if(Buffer.isBuffer(data)) {
          for(i = 0; i < len; i++) {
            j = 2*data[i];
            if(DD[j]===0xFF && DD[j+1]===0xFD) { j=2*((data[i]<<8)+data[i+1]); ++i; }
            out[k++] = DD[j]; out[k++] = DD[j+1];
          }
        } else if(typeof data === "string") {
          for(i = 0; i < len; i++) {
            j = 2*data.charCodeAt(i);
            if(DD[j]===0xFF && DD[j+1]===0xFD) { j=2*((data.charCodeAt(i)<<8)+data.charCodeAt(i+1)); ++i; }
            out[k++] = DD[j]; out[k++] = DD[j+1];
          }
        } else {
          for(i = 0; i < len; i++) {
            j = 2*data[i];
            if(DD[j]===0xFF && DD[j+1]===0xFD) { j=2*((data[i]<<8)+data[i+1]); ++i; }
            out[k++] = DD[j]; out[k++] = DD[j+1];
          }
        }
        return out.slice(0,k).toString('ucs2');
      };
    };
    magic_decode[65001] = function utf8_d(data) {
      if(typeof data === "string") return utf8_d(data.split("").map(cca));
      var len = data.length, w = 0, ww = 0;
      if(4 * len > mdl) { mdl = 4 * len; mdb = new Buffer(mdl); }
      var i = 0;
      if(len >= 3 && data[0] == 0xEF) if(data[1] == 0xBB && data[2] == 0xBF) i = 3;
      for(var j = 1, k = 0, D = 0; i < len; i+=j) {
        j = 1; D = data[i];
        if(D < 128) w = D;
        else if(D < 224) { w=(D&31)*64+(data[i+1]&63); j=2; }
        else if(D < 240) { w=((D&15)<<12)+(data[i+1]&63)*64+(data[i+2]&63); j=3; }
        else { w=(D&7)*262144+((data[i+1]&63)<<12)+(data[i+2]&63)*64+(data[i+3]&63); j=4; }
        if(w < 65536) { mdb[k++] = w&255; mdb[k++] = w>>8; }
        else {
          w -= 65536; ww = 0xD800 + ((w>>10)&1023); w = 0xDC00 + (w&1023);
          mdb[k++] = ww&255; mdb[k++] = ww>>>8; mdb[k++] = w&255; mdb[k++] = (w>>>8)&255;
        }
      }
      return mdb.slice(0,k).toString('ucs2');
    };
    magic_encode[65001] = function utf8_e(data, ofmt) {
      if(has_buf && Buffer.isBuffer(data)) {
        if(!ofmt || ofmt === 'buf') return data;
        if(ofmt !== 'arr') return data.toString('binary');
        return [].slice.call(data);
      }
      var len = data.length, w = 0, ww = 0, j = 0;
      var direct = typeof data === "string";
      if(4 * len > mdl) { mdl = 4 * len; mdb = new Buffer(mdl); }
      for(var i = 0; i < len; ++i) {
        w = direct ? data.charCodeAt(i) : data[i].charCodeAt(0);
        if(w <= 0x007F) mdb[j++] = w;
        else if(w <= 0x07FF) {
          mdb[j++] = 192 + (w >> 6);
          mdb[j++] = 128 + (w&63);
        } else if(w >= 0xD800 && w <= 0xDFFF) {
          w -= 0xD800; ++i;
          ww = (direct ? data.charCodeAt(i) : data[i].charCodeAt(0)) - 0xDC00 + (w << 10);
          mdb[j++] = 240 + ((ww>>>18) & 0x07);
          mdb[j++] = 144 + ((ww>>>12) & 0x3F);
          mdb[j++] = 128 + ((ww>>>6) & 0x3F);
          mdb[j++] = 128 + (ww & 0x3F);
        } else {
          mdb[j++] = 224 + (w >> 12);
          mdb[j++] = 128 + ((w >> 6)&63);
          mdb[j++] = 128 + (w&63);
        }
      }
      if(!ofmt || ofmt === 'buf') return mdb.slice(0,j);
      if(ofmt !== 'arr') return mdb.slice(0,j).toString('binary');
      return [].slice.call(mdb, 0, j);
    };
  }

  var encache = function encache() {
    if(has_buf) {
      if(cpdcache[sbcs_cache[0]]) return;
      var i=0, s=0;
      for(i = 0; i < sbcs_cache.length; ++i) {
        s = sbcs_cache[i];
        if(cpt[s]) {
          cpdcache[s] = sbcs_decode(s);
          cpecache[s] = sbcs_encode(s);
        }
      }
      for(i = 0; i < dbcs_cache.length; ++i) {
        s = dbcs_cache[i];
        if(cpt[s]) {
          cpdcache[s] = dbcs_decode(s);
          cpecache[s] = dbcs_encode(s);
        }
      }
      for(i = 0; i < magic_cache.length; ++i) {
        s = magic_cache[i];
        if(magic_decode[s]) cpdcache[s] = magic_decode[s];
        if(magic_encode[s]) cpecache[s] = magic_encode[s];
      }
    }
  };
  var null_enc = function(data, ofmt) { return ""; };
  var cp_decache = function cp_decache(cp) { delete cpdcache[cp]; delete cpecache[cp]; };
  var decache = function decache() {
    if(has_buf) {
      if(!cpdcache[sbcs_cache[0]]) return;
      sbcs_cache.forEach(cp_decache);
      dbcs_cache.forEach(cp_decache);
      magic_cache.forEach(cp_decache);
    }
    last_enc = null_enc; last_cp = 0;
  };
  var cache = {
    encache: encache,
    decache: decache,
    sbcs: sbcs_cache,
    dbcs: dbcs_cache
  };

  encache();

  var BM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var SetD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'(),-./:?";
  var last_enc = null_enc, last_cp = 0;
  var encode = function encode(cp, data, ofmt) {
    if(cp === last_cp && last_enc) { return last_enc(data, ofmt); }
    if(cpecache[cp]) { last_enc = cpecache[last_cp=cp]; return last_enc(data, ofmt); }
    if(has_buf && Buffer.isBuffer(data)) data = data.toString('utf8');
    var len = data.length;
    var out = has_buf ? new Buffer(4*len) : [], w=0, i=0, j = 0, ww=0;
    var C = cpt[cp], E, M = "";
    var isstr = typeof data === 'string';
    if(C && (E=C.enc)) for(i = 0; i < len; ++i, ++j) {
      w = E[isstr? data.charAt(i) : data[i]];
      if(w > 255) {
        out[j] = w>>8;
        out[++j] = w&255;
      } else out[j] = w&255;
    }
    else if((M=magic[cp])) switch(M) {
      case "utf8":
        if(has_buf && isstr) { out = new Buffer(data, M); j = out.length; break; }
        for(i = 0; i < len; ++i, ++j) {
          w = isstr ? data.charCodeAt(i) : data[i].charCodeAt(0);
          if(w <= 0x007F) out[j] = w;
          else if(w <= 0x07FF) {
            out[j]   = 192 + (w >> 6);
            out[++j] = 128 + (w&63);
          } else if(w >= 0xD800 && w <= 0xDFFF) {
            w -= 0xD800;
            ww = (isstr ? data.charCodeAt(++i) : data[++i].charCodeAt(0)) - 0xDC00 + (w << 10);
            out[j]   = 240 + ((ww>>>18) & 0x07);
            out[++j] = 144 + ((ww>>>12) & 0x3F);
            out[++j] = 128 + ((ww>>>6) & 0x3F);
            out[++j] = 128 + (ww & 0x3F);
          } else {
            out[j]   = 224 + (w >> 12);
            out[++j] = 128 + ((w >> 6)&63);
            out[++j] = 128 + (w&63);
          }
        }
        break;
      case "ascii":
        if(has_buf && typeof data === "string") { out = new Buffer(data, M); j = out.length; break; }
        for(i = 0; i < len; ++i, ++j) {
          w = isstr ? data.charCodeAt(i) : data[i].charCodeAt(0);
          if(w <= 0x007F) out[j] = w;
          else throw new Error("bad ascii " + w);
        }
        break;
      case "utf16le":
        if(has_buf && typeof data === "string") { out = new Buffer(data, M); j = out.length; break; }
        for(i = 0; i < len; ++i) {
          w = isstr ? data.charCodeAt(i) : data[i].charCodeAt(0);
          out[j++] = w&255;
          out[j++] = w>>8;
        }
        break;
      case "utf16be":
        for(i = 0; i < len; ++i) {
          w = isstr ? data.charCodeAt(i) : data[i].charCodeAt(0);
          out[j++] = w>>8;
          out[j++] = w&255;
        }
        break;
      case "utf32le":
        for(i = 0; i < len; ++i) {
          w = isstr ? data.charCodeAt(i) : data[i].charCodeAt(0);
          if(w >= 0xD800 && w <= 0xDFFF) w = 0x10000 + ((w - 0xD800) << 10) + (data[++i].charCodeAt(0) - 0xDC00);
          out[j++] = w&255; w >>= 8;
          out[j++] = w&255; w >>= 8;
          out[j++] = w&255; w >>= 8;
          out[j++] = w&255;
        }
        break;
      case "utf32be":
        for(i = 0; i < len; ++i) {
          w = isstr ? data.charCodeAt(i) : data[i].charCodeAt(0);
          if(w >= 0xD800 && w <= 0xDFFF) w = 0x10000 + ((w - 0xD800) << 10) + (data[++i].charCodeAt(0) - 0xDC00);
          out[j+3] = w&255; w >>= 8;
          out[j+2] = w&255; w >>= 8;
          out[j+1] = w&255; w >>= 8;
          out[j] = w&255;
          j+=4;
        }
        break;
      case "utf7":
        for(i = 0; i < len; i++) {
          var c = isstr ? data.charAt(i) : data[i].charAt(0);
          if(c === "+") { out[j++] = 0x2b; out[j++] = 0x2d; continue; }
          if(SetD.indexOf(c) > -1) { out[j++] = c.charCodeAt(0); continue; }
          var tt = encode(1201, c);
          out[j++] = 0x2b;
          out[j++] = BM.charCodeAt(tt[0]>>2);
          out[j++] = BM.charCodeAt(((tt[0]&0x03)<<4) + ((tt[1]||0)>>4));
          out[j++] = BM.charCodeAt(((tt[1]&0x0F)<<2) + ((tt[2]||0)>>6));
          out[j++] = 0x2d;
        }
        break;
      default: throw new Error("Unsupported magic: " + cp + " " + magic[cp]);
    }
    else throw new Error("Unrecognized CP: " + cp);
    out = out.slice(0,j);
    if(!has_buf) return (ofmt == 'str') ? (out).map(sfcc).join("") : out;
    if(!ofmt || ofmt === 'buf') return out;
    if(ofmt !== 'arr') return out.toString('binary');
    return [].slice.call(out);
  };
  var decode = function decode(cp, data) {
    var F; if((F=cpdcache[cp])) return F(data);
    if(typeof data === "string") return decode(cp, data.split("").map(cca));
    var len = data.length, out = new Array(len), s="", w=0, i=0, j=1, k=0, ww=0;
    var C = cpt[cp], D, M="";
    if(C && (D=C.dec)) {
      for(i = 0; i < len; i+=j) {
        j = 2;
        s = D[(data[i]<<8)+ data[i+1]];
        if(!s) {
          j = 1;
          s = D[data[i]];
        }
        if(!s) throw new Error('Unrecognized code: ' + data[i] + ' ' + data[i+j-1] + ' ' + i + ' ' + j + ' ' + D[data[i]]);
        out[k++] = s;
      }
    }
    else if((M=magic[cp])) switch(M) {
      case "utf8":
        if(len >= 3 && data[0] == 0xEF) if(data[1] == 0xBB && data[2] == 0xBF) i = 3;
        for(; i < len; i+=j) {
          j = 1;
          if(data[i] < 128) w = data[i];
          else if(data[i] < 224) { w=(data[i]&31)*64+(data[i+1]&63); j=2; }
          else if(data[i] < 240) { w=((data[i]&15)<<12)+(data[i+1]&63)*64+(data[i+2]&63); j=3; }
          else { w=(data[i]&7)*262144+((data[i+1]&63)<<12)+(data[i+2]&63)*64+(data[i+3]&63); j=4; }
          if(w < 65536) { out[k++] = String.fromCharCode(w); }
          else {
            w -= 65536; ww = 0xD800 + ((w>>10)&1023); w = 0xDC00 + (w&1023);
            out[k++] = String.fromCharCode(ww); out[k++] = String.fromCharCode(w);
          }
        }
        break;
      case "ascii":
        if(has_buf && Buffer.isBuffer(data)) return data.toString(M);
        for(i = 0; i < len; i++) out[i] = String.fromCharCode(data[i]);
        k = len; break;
      case "utf16le":
        if(len >= 2 && data[0] == 0xFF) if(data[1] == 0xFE) i = 2;
        if(has_buf && Buffer.isBuffer(data)) return data.toString(M);
        j = 2;
        for(; i+1 < len; i+=j) {
          out[k++] = String.fromCharCode((data[i+1]<<8) + data[i]);
        }
        break;
      case "utf16be":
        if(len >= 2 && data[0] == 0xFE) if(data[1] == 0xFF) i = 2;
        j = 2;
        for(; i+1 < len; i+=j) {
          out[k++] = String.fromCharCode((data[i]<<8) + data[i+1]);
        }
        break;
      case "utf32le":
        if(len >= 4 && data[0] == 0xFF) if(data[1] == 0xFE && data[2] === 0 && data[3] === 0) i = 4;
        j = 4;
        for(; i < len; i+=j) {
          w = (data[i+3]<<24) + (data[i+2]<<16) + (data[i+1]<<8) + (data[i]);
          if(w > 0xFFFF) {
            w -= 0x10000;
            out[k++] = String.fromCharCode(0xD800 + ((w >> 10) & 0x3FF));
            out[k++] = String.fromCharCode(0xDC00 + (w & 0x3FF));
          }
          else out[k++] = String.fromCharCode(w);
        }
        break;
      case "utf32be":
        if(len >= 4 && data[3] == 0xFF) if(data[2] == 0xFE && data[1] === 0 && data[0] === 0) i = 4;
        j = 4;
        for(; i < len; i+=j) {
          w = (data[i]<<24) + (data[i+1]<<16) + (data[i+2]<<8) + (data[i+3]);
          if(w > 0xFFFF) {
            w -= 0x10000;
            out[k++] = String.fromCharCode(0xD800 + ((w >> 10) & 0x3FF));
            out[k++] = String.fromCharCode(0xDC00 + (w & 0x3FF));
          }
          else out[k++] = String.fromCharCode(w);
        }
        break;
      case "utf7":
        if(len >= 4 && data[0] == 0x2B && data[1] == 0x2F && data[2] == 0x76) {
          if(len >= 5 && data[3] == 0x38 && data[4] == 0x2D) i = 5;
          else if(data[3] == 0x38 || data[3] == 0x39 || data[3] == 0x2B || data[3] == 0x2F) i = 4;
        }
        for(; i < len; i+=j) {
          if(data[i] !== 0x2b) { j=1; out[k++] = String.fromCharCode(data[i]); continue; }
          j=1;
          if(data[i+1] === 0x2d) { j = 2; out[k++] = "+"; continue; }
          while(String.fromCharCode(data[i+j]).match(/[A-Za-z0-9+\/]/)) j++;
          var dash = 0;
          if(data[i+j] === 0x2d) { ++j; dash=1; }
          var tt = [];
          var o64 = "";
          var c1=0, c2=0, c3=0;
          var e1=0, e2=0, e3=0, e4=0;
          for(var l = 1; l < j - dash;) {
            e1 = BM.indexOf(String.fromCharCode(data[i+l++]));
            e2 = BM.indexOf(String.fromCharCode(data[i+l++]));
            c1 = e1 << 2 | e2 >> 4;
            tt.push(c1);
            e3 = BM.indexOf(String.fromCharCode(data[i+l++]));
            if(e3 === -1) break;
            c2 = (e2 & 15) << 4 | e3 >> 2;
            tt.push(c2);
            e4 = BM.indexOf(String.fromCharCode(data[i+l++]));
            if(e4 === -1) break;
            c3 = (e3 & 3) << 6 | e4;
            if(e4 < 64) tt.push(c3);
          }
          o64 = decode(1201, tt);
          for(l = 0; l < o64.length; ++l) out[k++] = o64.charAt(l);
        }
        break;
      default: throw new Error("Unsupported magic: " + cp + " " + magic[cp]);
    }
    else throw new Error("Unrecognized CP: " + cp);
    return out.slice(0,k).join("");
  };
  var hascp = function hascp(cp) { return !!(cpt[cp] || magic[cp]); };
  cpt.utils = { decode: decode, encode: encode, hascp: hascp, magic: magic, cache:cache };
  return cpt;
}));
cptable[437] = (function(){ var d = "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ", D = [], e = {}; for(var i=0;i!=d.length;++i) { if(d.charCodeAt(i) !== 0xFFFD) e[d.charAt(i)] = i; D[i] = d.charAt(i); } return {"enc": e, "dec": D }; })();
cptable[932] = (function(){ var d = [], e = {}, D = [], j;
D[0] = "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~���������������������������������｡｢｣､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾞﾟ��������������������������������".split("");
for(j = 0; j != D[0].length; ++j) if(D[0][j].charCodeAt(0) !== 0xFFFD) { e[D[0][j]] = 0 + j; d[0 + j] = D[0][j];}
D[129] = "����������������������������������������������������������������　、。，．・：；？！゛゜´｀¨＾￣＿ヽヾゝゞ〃仝々〆〇ー―‐／＼～∥｜…‥‘’“”（）〔〕［］｛｝〈〉《》「」『』【】＋－±×�÷＝≠＜＞≦≧∞∴♂♀°′″℃￥＄￠￡％＃＆＊＠§☆★○●◎◇◆□■△▲▽▼※〒→←↑↓〓�����������∈∋⊆⊇⊂⊃∪∩��������∧∨￢⇒⇔∀∃�����������∠⊥⌒∂∇≡≒≪≫√∽∝∵∫∬�������Å‰♯♭♪†‡¶����◯���".split("");
for(j = 0; j != D[129].length; ++j) if(D[129][j].charCodeAt(0) !== 0xFFFD) { e[D[129][j]] = 33024 + j; d[33024 + j] = D[129][j];}
D[130] = "�������������������������������������������������������������������������������０１２３４５６７８９�������ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ�������ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ����ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをん��������������".split("");
for(j = 0; j != D[130].length; ++j) if(D[130][j].charCodeAt(0) !== 0xFFFD) { e[D[130][j]] = 33280 + j; d[33280 + j] = D[130][j];}
D[131] = "����������������������������������������������������������������ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミ�ムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ��������ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ��������αβγδεζηθικλμνξοπρστυφχψω�����������������������������������������".split("");
for(j = 0; j != D[131].length; ++j) if(D[131][j].charCodeAt(0) !== 0xFFFD) { e[D[131][j]] = 33536 + j; d[33536 + j] = D[131][j];}
D[132] = "����������������������������������������������������������������АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ���������������абвгдеёжзийклмн�опрстуфхцчшщъыьэюя�������������─│┌┐┘└├┬┤┴┼━┃┏┓┛┗┣┳┫┻╋┠┯┨┷┿┝┰┥┸╂�����������������������������������������������������������������".split("");
for(j = 0; j != D[132].length; ++j) if(D[132][j].charCodeAt(0) !== 0xFFFD) { e[D[132][j]] = 33792 + j; d[33792 + j] = D[132][j];}
D[135] = "����������������������������������������������������������������①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ�㍉㌔㌢㍍㌘㌧㌃㌶㍑㍗㌍㌦㌣㌫㍊㌻㎜㎝㎞㎎㎏㏄㎡��������㍻�〝〟№㏍℡㊤㊥㊦㊧㊨㈱㈲㈹㍾㍽㍼≒≡∫∮∑√⊥∠∟⊿∵∩∪���������������������������������������������������������������������������������������������������".split("");
for(j = 0; j != D[135].length; ++j) if(D[135][j].charCodeAt(0) !== 0xFFFD) { e[D[135][j]] = 34560 + j; d[34560 + j] = D[135][j];}
D[136] = "���������������������������������������������������������������������������������������������������������������������������������������������������������������亜唖娃阿哀愛挨姶逢葵茜穐悪握渥旭葦芦鯵梓圧斡扱宛姐虻飴絢綾鮎或粟袷安庵按暗案闇鞍杏以伊位依偉囲夷委威尉惟意慰易椅為畏異移維緯胃萎衣謂違遺医井亥域育郁磯一壱溢逸稲茨芋鰯允印咽員因姻引飲淫胤蔭���".split("");
for(j = 0; j != D[136].length; ++j) if(D[136][j].charCodeAt(0) !== 0xFFFD) { e[D[136][j]] = 34816 + j; d[34816 + j] = D[136][j];}
D[137] = "����������������������������������������������������������������院陰隠韻吋右宇烏羽迂雨卯鵜窺丑碓臼渦嘘唄欝蔚鰻姥厩浦瓜閏噂云運雲荏餌叡営嬰影映曳栄永泳洩瑛盈穎頴英衛詠鋭液疫益駅悦謁越閲榎厭円�園堰奄宴延怨掩援沿演炎焔煙燕猿縁艶苑薗遠鉛鴛塩於汚甥凹央奥往応押旺横欧殴王翁襖鴬鴎黄岡沖荻億屋憶臆桶牡乙俺卸恩温穏音下化仮何伽価佳加可嘉夏嫁家寡科暇果架歌河火珂禍禾稼箇花苛茄荷華菓蝦課嘩貨迦過霞蚊俄峨我牙画臥芽蛾賀雅餓駕介会解回塊壊廻快怪悔恢懐戒拐改���".split("");
for(j = 0; j != D[137].length; ++j) if(D[137][j].charCodeAt(0) !== 0xFFFD) { e[D[137][j]] = 35072 + j; d[35072 + j] = D[137][j];}
D[138] = "����������������������������������������������������������������魁晦械海灰界皆絵芥蟹開階貝凱劾外咳害崖慨概涯碍蓋街該鎧骸浬馨蛙垣柿蛎鈎劃嚇各廓拡撹格核殻獲確穫覚角赫較郭閣隔革学岳楽額顎掛笠樫�橿梶鰍潟割喝恰括活渇滑葛褐轄且鰹叶椛樺鞄株兜竃蒲釜鎌噛鴨栢茅萱粥刈苅瓦乾侃冠寒刊勘勧巻喚堪姦完官寛干幹患感慣憾換敢柑桓棺款歓汗漢澗潅環甘監看竿管簡緩缶翰肝艦莞観諌貫還鑑間閑関陥韓館舘丸含岸巌玩癌眼岩翫贋雁頑顔願企伎危喜器基奇嬉寄岐希幾忌揮机旗既期棋棄���".split("");
for(j = 0; j != D[138].length; ++j) if(D[138][j].charCodeAt(0) !== 0xFFFD) { e[D[138][j]] = 35328 + j; d[35328 + j] = D[138][j];}
D[139] = "����������������������������������������������������������������機帰毅気汽畿祈季稀紀徽規記貴起軌輝飢騎鬼亀偽儀妓宜戯技擬欺犠疑祇義蟻誼議掬菊鞠吉吃喫桔橘詰砧杵黍却客脚虐逆丘久仇休及吸宮弓急救�朽求汲泣灸球究窮笈級糾給旧牛去居巨拒拠挙渠虚許距鋸漁禦魚亨享京供侠僑兇競共凶協匡卿叫喬境峡強彊怯恐恭挟教橋況狂狭矯胸脅興蕎郷鏡響饗驚仰凝尭暁業局曲極玉桐粁僅勤均巾錦斤欣欽琴禁禽筋緊芹菌衿襟謹近金吟銀九倶句区狗玖矩苦躯駆駈駒具愚虞喰空偶寓遇隅串櫛釧屑屈���".split("");
for(j = 0; j != D[139].length; ++j) if(D[139][j].charCodeAt(0) !== 0xFFFD) { e[D[139][j]] = 35584 + j; d[35584 + j] = D[139][j];}
D[140] = "����������������������������������������������������������������掘窟沓靴轡窪熊隈粂栗繰桑鍬勲君薫訓群軍郡卦袈祁係傾刑兄啓圭珪型契形径恵慶慧憩掲携敬景桂渓畦稽系経継繋罫茎荊蛍計詣警軽頚鶏芸迎鯨�劇戟撃激隙桁傑欠決潔穴結血訣月件倹倦健兼券剣喧圏堅嫌建憲懸拳捲検権牽犬献研硯絹県肩見謙賢軒遣鍵険顕験鹸元原厳幻弦減源玄現絃舷言諺限乎個古呼固姑孤己庫弧戸故枯湖狐糊袴股胡菰虎誇跨鈷雇顧鼓五互伍午呉吾娯後御悟梧檎瑚碁語誤護醐乞鯉交佼侯候倖光公功効勾厚口向���".split("");
for(j = 0; j != D[140].length; ++j) if(D[140][j].charCodeAt(0) !== 0xFFFD) { e[D[140][j]] = 35840 + j; d[35840 + j] = D[140][j];}
D[141] = "����������������������������������������������������������������后喉坑垢好孔孝宏工巧巷幸広庚康弘恒慌抗拘控攻昂晃更杭校梗構江洪浩港溝甲皇硬稿糠紅紘絞綱耕考肯肱腔膏航荒行衡講貢購郊酵鉱砿鋼閤降�項香高鴻剛劫号合壕拷濠豪轟麹克刻告国穀酷鵠黒獄漉腰甑忽惚骨狛込此頃今困坤墾婚恨懇昏昆根梱混痕紺艮魂些佐叉唆嵯左差査沙瑳砂詐鎖裟坐座挫債催再最哉塞妻宰彩才採栽歳済災采犀砕砦祭斎細菜裁載際剤在材罪財冴坂阪堺榊肴咲崎埼碕鷺作削咋搾昨朔柵窄策索錯桜鮭笹匙冊刷���".split("");
for(j = 0; j != D[141].length; ++j) if(D[141][j].charCodeAt(0) !== 0xFFFD) { e[D[141][j]] = 36096 + j; d[36096 + j] = D[141][j];}
D[142] = "����������������������������������������������������������������察拶撮擦札殺薩雑皐鯖捌錆鮫皿晒三傘参山惨撒散桟燦珊産算纂蚕讃賛酸餐斬暫残仕仔伺使刺司史嗣四士始姉姿子屍市師志思指支孜斯施旨枝止�死氏獅祉私糸紙紫肢脂至視詞詩試誌諮資賜雌飼歯事似侍児字寺慈持時次滋治爾璽痔磁示而耳自蒔辞汐鹿式識鴫竺軸宍雫七叱執失嫉室悉湿漆疾質実蔀篠偲柴芝屡蕊縞舎写射捨赦斜煮社紗者謝車遮蛇邪借勺尺杓灼爵酌釈錫若寂弱惹主取守手朱殊狩珠種腫趣酒首儒受呪寿授樹綬需囚収周���".split("");
for(j = 0; j != D[142].length; ++j) if(D[142][j].charCodeAt(0) !== 0xFFFD) { e[D[142][j]] = 36352 + j; d[36352 + j] = D[142][j];}
D[143] = "����������������������������������������������������������������宗就州修愁拾洲秀秋終繍習臭舟蒐衆襲讐蹴輯週酋酬集醜什住充十従戎柔汁渋獣縦重銃叔夙宿淑祝縮粛塾熟出術述俊峻春瞬竣舜駿准循旬楯殉淳�準潤盾純巡遵醇順処初所暑曙渚庶緒署書薯藷諸助叙女序徐恕鋤除傷償勝匠升召哨商唱嘗奨妾娼宵将小少尚庄床廠彰承抄招掌捷昇昌昭晶松梢樟樵沼消渉湘焼焦照症省硝礁祥称章笑粧紹肖菖蒋蕉衝裳訟証詔詳象賞醤鉦鍾鐘障鞘上丈丞乗冗剰城場壌嬢常情擾条杖浄状畳穣蒸譲醸錠嘱埴飾���".split("");
for(j = 0; j != D[143].length; ++j) if(D[143][j].charCodeAt(0) !== 0xFFFD) { e[D[143][j]] = 36608 + j; d[36608 + j] = D[143][j];}
D[144] = "����������������������������������������������������������������拭植殖燭織職色触食蝕辱尻伸信侵唇娠寝審心慎振新晋森榛浸深申疹真神秦紳臣芯薪親診身辛進針震人仁刃塵壬尋甚尽腎訊迅陣靭笥諏須酢図厨�逗吹垂帥推水炊睡粋翠衰遂酔錐錘随瑞髄崇嵩数枢趨雛据杉椙菅頗雀裾澄摺寸世瀬畝是凄制勢姓征性成政整星晴棲栖正清牲生盛精聖声製西誠誓請逝醒青静斉税脆隻席惜戚斥昔析石積籍績脊責赤跡蹟碩切拙接摂折設窃節説雪絶舌蝉仙先千占宣専尖川戦扇撰栓栴泉浅洗染潜煎煽旋穿箭線���".split("");
for(j = 0; j != D[144].length; ++j) if(D[144][j].charCodeAt(0) !== 0xFFFD) { e[D[144][j]] = 36864 + j; d[36864 + j] = D[144][j];}
D[145] = "����������������������������������������������������������������繊羨腺舛船薦詮賎践選遷銭銑閃鮮前善漸然全禅繕膳糎噌塑岨措曾曽楚狙疏疎礎祖租粗素組蘇訴阻遡鼠僧創双叢倉喪壮奏爽宋層匝惣想捜掃挿掻�操早曹巣槍槽漕燥争痩相窓糟総綜聡草荘葬蒼藻装走送遭鎗霜騒像増憎臓蔵贈造促側則即息捉束測足速俗属賊族続卒袖其揃存孫尊損村遜他多太汰詑唾堕妥惰打柁舵楕陀駄騨体堆対耐岱帯待怠態戴替泰滞胎腿苔袋貸退逮隊黛鯛代台大第醍題鷹滝瀧卓啄宅托択拓沢濯琢託鐸濁諾茸凧蛸只���".split("");
for(j = 0; j != D[145].length; ++j) if(D[145][j].charCodeAt(0) !== 0xFFFD) { e[D[145][j]] = 37120 + j; d[37120 + j] = D[145][j];}
D[146] = "����������������������������������������������������������������叩但達辰奪脱巽竪辿棚谷狸鱈樽誰丹単嘆坦担探旦歎淡湛炭短端箪綻耽胆蛋誕鍛団壇弾断暖檀段男談値知地弛恥智池痴稚置致蜘遅馳築畜竹筑蓄�逐秩窒茶嫡着中仲宙忠抽昼柱注虫衷註酎鋳駐樗瀦猪苧著貯丁兆凋喋寵帖帳庁弔張彫徴懲挑暢朝潮牒町眺聴脹腸蝶調諜超跳銚長頂鳥勅捗直朕沈珍賃鎮陳津墜椎槌追鎚痛通塚栂掴槻佃漬柘辻蔦綴鍔椿潰坪壷嬬紬爪吊釣鶴亭低停偵剃貞呈堤定帝底庭廷弟悌抵挺提梯汀碇禎程締艇訂諦蹄逓���".split("");
for(j = 0; j != D[146].length; ++j) if(D[146][j].charCodeAt(0) !== 0xFFFD) { e[D[146][j]] = 37376 + j; d[37376 + j] = D[146][j];}
D[147] = "����������������������������������������������������������������邸鄭釘鼎泥摘擢敵滴的笛適鏑溺哲徹撤轍迭鉄典填天展店添纏甜貼転顛点伝殿澱田電兎吐堵塗妬屠徒斗杜渡登菟賭途都鍍砥砺努度土奴怒倒党冬�凍刀唐塔塘套宕島嶋悼投搭東桃梼棟盗淘湯涛灯燈当痘祷等答筒糖統到董蕩藤討謄豆踏逃透鐙陶頭騰闘働動同堂導憧撞洞瞳童胴萄道銅峠鴇匿得徳涜特督禿篤毒独読栃橡凸突椴届鳶苫寅酉瀞噸屯惇敦沌豚遁頓呑曇鈍奈那内乍凪薙謎灘捺鍋楢馴縄畷南楠軟難汝二尼弐迩匂賑肉虹廿日乳入���".split("");
for(j = 0; j != D[147].length; ++j) if(D[147][j].charCodeAt(0) !== 0xFFFD) { e[D[147][j]] = 37632 + j; d[37632 + j] = D[147][j];}
D[148] = "����������������������������������������������������������������如尿韮任妊忍認濡禰祢寧葱猫熱年念捻撚燃粘乃廼之埜嚢悩濃納能脳膿農覗蚤巴把播覇杷波派琶破婆罵芭馬俳廃拝排敗杯盃牌背肺輩配倍培媒梅�楳煤狽買売賠陪這蝿秤矧萩伯剥博拍柏泊白箔粕舶薄迫曝漠爆縛莫駁麦函箱硲箸肇筈櫨幡肌畑畠八鉢溌発醗髪伐罰抜筏閥鳩噺塙蛤隼伴判半反叛帆搬斑板氾汎版犯班畔繁般藩販範釆煩頒飯挽晩番盤磐蕃蛮匪卑否妃庇彼悲扉批披斐比泌疲皮碑秘緋罷肥被誹費避非飛樋簸備尾微枇毘琵眉美���".split("");
for(j = 0; j != D[148].length; ++j) if(D[148][j].charCodeAt(0) !== 0xFFFD) { e[D[148][j]] = 37888 + j; d[37888 + j] = D[148][j];}
D[149] = "����������������������������������������������������������������鼻柊稗匹疋髭彦膝菱肘弼必畢筆逼桧姫媛紐百謬俵彪標氷漂瓢票表評豹廟描病秒苗錨鋲蒜蛭鰭品彬斌浜瀕貧賓頻敏瓶不付埠夫婦富冨布府怖扶敷�斧普浮父符腐膚芙譜負賦赴阜附侮撫武舞葡蕪部封楓風葺蕗伏副復幅服福腹複覆淵弗払沸仏物鮒分吻噴墳憤扮焚奮粉糞紛雰文聞丙併兵塀幣平弊柄並蔽閉陛米頁僻壁癖碧別瞥蔑箆偏変片篇編辺返遍便勉娩弁鞭保舗鋪圃捕歩甫補輔穂募墓慕戊暮母簿菩倣俸包呆報奉宝峰峯崩庖抱捧放方朋���".split("");
for(j = 0; j != D[149].length; ++j) if(D[149][j].charCodeAt(0) !== 0xFFFD) { e[D[149][j]] = 38144 + j; d[38144 + j] = D[149][j];}
D[150] = "����������������������������������������������������������������法泡烹砲縫胞芳萌蓬蜂褒訪豊邦鋒飽鳳鵬乏亡傍剖坊妨帽忘忙房暴望某棒冒紡肪膨謀貌貿鉾防吠頬北僕卜墨撲朴牧睦穆釦勃没殆堀幌奔本翻凡盆�摩磨魔麻埋妹昧枚毎哩槙幕膜枕鮪柾鱒桝亦俣又抹末沫迄侭繭麿万慢満漫蔓味未魅巳箕岬密蜜湊蓑稔脈妙粍民眠務夢無牟矛霧鵡椋婿娘冥名命明盟迷銘鳴姪牝滅免棉綿緬面麺摸模茂妄孟毛猛盲網耗蒙儲木黙目杢勿餅尤戻籾貰問悶紋門匁也冶夜爺耶野弥矢厄役約薬訳躍靖柳薮鑓愉愈油癒���".split("");
for(j = 0; j != D[150].length; ++j) if(D[150][j].charCodeAt(0) !== 0xFFFD) { e[D[150][j]] = 38400 + j; d[38400 + j] = D[150][j];}
D[151] = "����������������������������������������������������������������諭輸唯佑優勇友宥幽悠憂揖有柚湧涌猶猷由祐裕誘遊邑郵雄融夕予余与誉輿預傭幼妖容庸揚揺擁曜楊様洋溶熔用窯羊耀葉蓉要謡踊遥陽養慾抑欲�沃浴翌翼淀羅螺裸来莱頼雷洛絡落酪乱卵嵐欄濫藍蘭覧利吏履李梨理璃痢裏裡里離陸律率立葎掠略劉流溜琉留硫粒隆竜龍侶慮旅虜了亮僚両凌寮料梁涼猟療瞭稜糧良諒遼量陵領力緑倫厘林淋燐琳臨輪隣鱗麟瑠塁涙累類令伶例冷励嶺怜玲礼苓鈴隷零霊麗齢暦歴列劣烈裂廉恋憐漣煉簾練聯���".split("");
for(j = 0; j != D[151].length; ++j) if(D[151][j].charCodeAt(0) !== 0xFFFD) { e[D[151][j]] = 38656 + j; d[38656 + j] = D[151][j];}
D[152] = "����������������������������������������������������������������蓮連錬呂魯櫓炉賂路露労婁廊弄朗楼榔浪漏牢狼篭老聾蝋郎六麓禄肋録論倭和話歪賄脇惑枠鷲亙亘鰐詫藁蕨椀湾碗腕��������������������������������������������弌丐丕个丱丶丼丿乂乖乘亂亅豫亊舒弍于亞亟亠亢亰亳亶从仍仄仆仂仗仞仭仟价伉佚估佛佝佗佇佶侈侏侘佻佩佰侑佯來侖儘俔俟俎俘俛俑俚俐俤俥倚倨倔倪倥倅伜俶倡倩倬俾俯們倆偃假會偕偐偈做偖偬偸傀傚傅傴傲���".split("");
for(j = 0; j != D[152].length; ++j) if(D[152][j].charCodeAt(0) !== 0xFFFD) { e[D[152][j]] = 38912 + j; d[38912 + j] = D[152][j];}
D[153] = "����������������������������������������������������������������僉僊傳僂僖僞僥僭僣僮價僵儉儁儂儖儕儔儚儡儺儷儼儻儿兀兒兌兔兢竸兩兪兮冀冂囘册冉冏冑冓冕冖冤冦冢冩冪冫决冱冲冰况冽凅凉凛几處凩凭�凰凵凾刄刋刔刎刧刪刮刳刹剏剄剋剌剞剔剪剴剩剳剿剽劍劔劒剱劈劑辨辧劬劭劼劵勁勍勗勞勣勦飭勠勳勵勸勹匆匈甸匍匐匏匕匚匣匯匱匳匸區卆卅丗卉卍凖卞卩卮夘卻卷厂厖厠厦厥厮厰厶參簒雙叟曼燮叮叨叭叺吁吽呀听吭吼吮吶吩吝呎咏呵咎呟呱呷呰咒呻咀呶咄咐咆哇咢咸咥咬哄哈咨���".split("");
for(j = 0; j != D[153].length; ++j) if(D[153][j].charCodeAt(0) !== 0xFFFD) { e[D[153][j]] = 39168 + j; d[39168 + j] = D[153][j];}
D[154] = "����������������������������������������������������������������咫哂咤咾咼哘哥哦唏唔哽哮哭哺哢唹啀啣啌售啜啅啖啗唸唳啝喙喀咯喊喟啻啾喘喞單啼喃喩喇喨嗚嗅嗟嗄嗜嗤嗔嘔嗷嘖嗾嗽嘛嗹噎噐營嘴嘶嘲嘸�噫噤嘯噬噪嚆嚀嚊嚠嚔嚏嚥嚮嚶嚴囂嚼囁囃囀囈囎囑囓囗囮囹圀囿圄圉圈國圍圓團圖嗇圜圦圷圸坎圻址坏坩埀垈坡坿垉垓垠垳垤垪垰埃埆埔埒埓堊埖埣堋堙堝塲堡塢塋塰毀塒堽塹墅墹墟墫墺壞墻墸墮壅壓壑壗壙壘壥壜壤壟壯壺壹壻壼壽夂夊夐夛梦夥夬夭夲夸夾竒奕奐奎奚奘奢奠奧奬奩���".split("");
for(j = 0; j != D[154].length; ++j) if(D[154][j].charCodeAt(0) !== 0xFFFD) { e[D[154][j]] = 39424 + j; d[39424 + j] = D[154][j];}
D[155] = "����������������������������������������������������������������奸妁妝佞侫妣妲姆姨姜妍姙姚娥娟娑娜娉娚婀婬婉娵娶婢婪媚媼媾嫋嫂媽嫣嫗嫦嫩嫖嫺嫻嬌嬋嬖嬲嫐嬪嬶嬾孃孅孀孑孕孚孛孥孩孰孳孵學斈孺宀�它宦宸寃寇寉寔寐寤實寢寞寥寫寰寶寳尅將專對尓尠尢尨尸尹屁屆屎屓屐屏孱屬屮乢屶屹岌岑岔妛岫岻岶岼岷峅岾峇峙峩峽峺峭嶌峪崋崕崗嵜崟崛崑崔崢崚崙崘嵌嵒嵎嵋嵬嵳嵶嶇嶄嶂嶢嶝嶬嶮嶽嶐嶷嶼巉巍巓巒巖巛巫已巵帋帚帙帑帛帶帷幄幃幀幎幗幔幟幢幤幇幵并幺麼广庠廁廂廈廐廏���".split("");
for(j = 0; j != D[155].length; ++j) if(D[155][j].charCodeAt(0) !== 0xFFFD) { e[D[155][j]] = 39680 + j; d[39680 + j] = D[155][j];}
D[156] = "����������������������������������������������������������������廖廣廝廚廛廢廡廨廩廬廱廳廰廴廸廾弃弉彝彜弋弑弖弩弭弸彁彈彌彎弯彑彖彗彙彡彭彳彷徃徂彿徊很徑徇從徙徘徠徨徭徼忖忻忤忸忱忝悳忿怡恠�怙怐怩怎怱怛怕怫怦怏怺恚恁恪恷恟恊恆恍恣恃恤恂恬恫恙悁悍惧悃悚悄悛悖悗悒悧悋惡悸惠惓悴忰悽惆悵惘慍愕愆惶惷愀惴惺愃愡惻惱愍愎慇愾愨愧慊愿愼愬愴愽慂慄慳慷慘慙慚慫慴慯慥慱慟慝慓慵憙憖憇憬憔憚憊憑憫憮懌懊應懷懈懃懆憺懋罹懍懦懣懶懺懴懿懽懼懾戀戈戉戍戌戔戛���".split("");
for(j = 0; j != D[156].length; ++j) if(D[156][j].charCodeAt(0) !== 0xFFFD) { e[D[156][j]] = 39936 + j; d[39936 + j] = D[156][j];}
D[157] = "����������������������������������������������������������������戞戡截戮戰戲戳扁扎扞扣扛扠扨扼抂抉找抒抓抖拔抃抔拗拑抻拏拿拆擔拈拜拌拊拂拇抛拉挌拮拱挧挂挈拯拵捐挾捍搜捏掖掎掀掫捶掣掏掉掟掵捫�捩掾揩揀揆揣揉插揶揄搖搴搆搓搦搶攝搗搨搏摧摯摶摎攪撕撓撥撩撈撼據擒擅擇撻擘擂擱擧舉擠擡抬擣擯攬擶擴擲擺攀擽攘攜攅攤攣攫攴攵攷收攸畋效敖敕敍敘敞敝敲數斂斃變斛斟斫斷旃旆旁旄旌旒旛旙无旡旱杲昊昃旻杳昵昶昴昜晏晄晉晁晞晝晤晧晨晟晢晰暃暈暎暉暄暘暝曁暹曉暾暼���".split("");
for(j = 0; j != D[157].length; ++j) if(D[157][j].charCodeAt(0) !== 0xFFFD) { e[D[157][j]] = 40192 + j; d[40192 + j] = D[157][j];}
D[158] = "����������������������������������������������������������������曄暸曖曚曠昿曦曩曰曵曷朏朖朞朦朧霸朮朿朶杁朸朷杆杞杠杙杣杤枉杰枩杼杪枌枋枦枡枅枷柯枴柬枳柩枸柤柞柝柢柮枹柎柆柧檜栞框栩桀桍栲桎�梳栫桙档桷桿梟梏梭梔條梛梃檮梹桴梵梠梺椏梍桾椁棊椈棘椢椦棡椌棍棔棧棕椶椒椄棗棣椥棹棠棯椨椪椚椣椡棆楹楷楜楸楫楔楾楮椹楴椽楙椰楡楞楝榁楪榲榮槐榿槁槓榾槎寨槊槝榻槃榧樮榑榠榜榕榴槞槨樂樛槿權槹槲槧樅榱樞槭樔槫樊樒櫁樣樓橄樌橲樶橸橇橢橙橦橈樸樢檐檍檠檄檢檣���".split("");
for(j = 0; j != D[158].length; ++j) if(D[158][j].charCodeAt(0) !== 0xFFFD) { e[D[158][j]] = 40448 + j; d[40448 + j] = D[158][j];}
D[159] = "����������������������������������������������������������������檗蘗檻櫃櫂檸檳檬櫞櫑櫟檪櫚櫪櫻欅蘖櫺欒欖鬱欟欸欷盜欹飮歇歃歉歐歙歔歛歟歡歸歹歿殀殄殃殍殘殕殞殤殪殫殯殲殱殳殷殼毆毋毓毟毬毫毳毯�麾氈氓气氛氤氣汞汕汢汪沂沍沚沁沛汾汨汳沒沐泄泱泓沽泗泅泝沮沱沾沺泛泯泙泪洟衍洶洫洽洸洙洵洳洒洌浣涓浤浚浹浙涎涕濤涅淹渕渊涵淇淦涸淆淬淞淌淨淒淅淺淙淤淕淪淮渭湮渮渙湲湟渾渣湫渫湶湍渟湃渺湎渤滿渝游溂溪溘滉溷滓溽溯滄溲滔滕溏溥滂溟潁漑灌滬滸滾漿滲漱滯漲滌���".split("");
for(j = 0; j != D[159].length; ++j) if(D[159][j].charCodeAt(0) !== 0xFFFD) { e[D[159][j]] = 40704 + j; d[40704 + j] = D[159][j];}
D[224] = "����������������������������������������������������������������漾漓滷澆潺潸澁澀潯潛濳潭澂潼潘澎澑濂潦澳澣澡澤澹濆澪濟濕濬濔濘濱濮濛瀉瀋濺瀑瀁瀏濾瀛瀚潴瀝瀘瀟瀰瀾瀲灑灣炙炒炯烱炬炸炳炮烟烋烝�烙焉烽焜焙煥煕熈煦煢煌煖煬熏燻熄熕熨熬燗熹熾燒燉燔燎燠燬燧燵燼燹燿爍爐爛爨爭爬爰爲爻爼爿牀牆牋牘牴牾犂犁犇犒犖犢犧犹犲狃狆狄狎狒狢狠狡狹狷倏猗猊猜猖猝猴猯猩猥猾獎獏默獗獪獨獰獸獵獻獺珈玳珎玻珀珥珮珞璢琅瑯琥珸琲琺瑕琿瑟瑙瑁瑜瑩瑰瑣瑪瑶瑾璋璞璧瓊瓏瓔珱���".split("");
for(j = 0; j != D[224].length; ++j) if(D[224][j].charCodeAt(0) !== 0xFFFD) { e[D[224][j]] = 57344 + j; d[57344 + j] = D[224][j];}
D[225] = "����������������������������������������������������������������瓠瓣瓧瓩瓮瓲瓰瓱瓸瓷甄甃甅甌甎甍甕甓甞甦甬甼畄畍畊畉畛畆畚畩畤畧畫畭畸當疆疇畴疊疉疂疔疚疝疥疣痂疳痃疵疽疸疼疱痍痊痒痙痣痞痾痿�痼瘁痰痺痲痳瘋瘍瘉瘟瘧瘠瘡瘢瘤瘴瘰瘻癇癈癆癜癘癡癢癨癩癪癧癬癰癲癶癸發皀皃皈皋皎皖皓皙皚皰皴皸皹皺盂盍盖盒盞盡盥盧盪蘯盻眈眇眄眩眤眞眥眦眛眷眸睇睚睨睫睛睥睿睾睹瞎瞋瞑瞠瞞瞰瞶瞹瞿瞼瞽瞻矇矍矗矚矜矣矮矼砌砒礦砠礪硅碎硴碆硼碚碌碣碵碪碯磑磆磋磔碾碼磅磊磬���".split("");
for(j = 0; j != D[225].length; ++j) if(D[225][j].charCodeAt(0) !== 0xFFFD) { e[D[225][j]] = 57600 + j; d[57600 + j] = D[225][j];}
D[226] = "����������������������������������������������������������������磧磚磽磴礇礒礑礙礬礫祀祠祗祟祚祕祓祺祿禊禝禧齋禪禮禳禹禺秉秕秧秬秡秣稈稍稘稙稠稟禀稱稻稾稷穃穗穉穡穢穩龝穰穹穽窈窗窕窘窖窩竈窰�窶竅竄窿邃竇竊竍竏竕竓站竚竝竡竢竦竭竰笂笏笊笆笳笘笙笞笵笨笶筐筺笄筍笋筌筅筵筥筴筧筰筱筬筮箝箘箟箍箜箚箋箒箏筝箙篋篁篌篏箴篆篝篩簑簔篦篥籠簀簇簓篳篷簗簍篶簣簧簪簟簷簫簽籌籃籔籏籀籐籘籟籤籖籥籬籵粃粐粤粭粢粫粡粨粳粲粱粮粹粽糀糅糂糘糒糜糢鬻糯糲糴糶糺紆���".split("");
for(j = 0; j != D[226].length; ++j) if(D[226][j].charCodeAt(0) !== 0xFFFD) { e[D[226][j]] = 57856 + j; d[57856 + j] = D[226][j];}
D[227] = "����������������������������������������������������������������紂紜紕紊絅絋紮紲紿紵絆絳絖絎絲絨絮絏絣經綉絛綏絽綛綺綮綣綵緇綽綫總綢綯緜綸綟綰緘緝緤緞緻緲緡縅縊縣縡縒縱縟縉縋縢繆繦縻縵縹繃縷�縲縺繧繝繖繞繙繚繹繪繩繼繻纃緕繽辮繿纈纉續纒纐纓纔纖纎纛纜缸缺罅罌罍罎罐网罕罔罘罟罠罨罩罧罸羂羆羃羈羇羌羔羞羝羚羣羯羲羹羮羶羸譱翅翆翊翕翔翡翦翩翳翹飜耆耄耋耒耘耙耜耡耨耿耻聊聆聒聘聚聟聢聨聳聲聰聶聹聽聿肄肆肅肛肓肚肭冐肬胛胥胙胝胄胚胖脉胯胱脛脩脣脯腋���".split("");
for(j = 0; j != D[227].length; ++j) if(D[227][j].charCodeAt(0) !== 0xFFFD) { e[D[227][j]] = 58112 + j; d[58112 + j] = D[227][j];}
D[228] = "����������������������������������������������������������������隋腆脾腓腑胼腱腮腥腦腴膃膈膊膀膂膠膕膤膣腟膓膩膰膵膾膸膽臀臂膺臉臍臑臙臘臈臚臟臠臧臺臻臾舁舂舅與舊舍舐舖舩舫舸舳艀艙艘艝艚艟艤�艢艨艪艫舮艱艷艸艾芍芒芫芟芻芬苡苣苟苒苴苳苺莓范苻苹苞茆苜茉苙茵茴茖茲茱荀茹荐荅茯茫茗茘莅莚莪莟莢莖茣莎莇莊荼莵荳荵莠莉莨菴萓菫菎菽萃菘萋菁菷萇菠菲萍萢萠莽萸蔆菻葭萪萼蕚蒄葷葫蒭葮蒂葩葆萬葯葹萵蓊葢蒹蒿蒟蓙蓍蒻蓚蓐蓁蓆蓖蒡蔡蓿蓴蔗蔘蔬蔟蔕蔔蓼蕀蕣蕘蕈���".split("");
for(j = 0; j != D[228].length; ++j) if(D[228][j].charCodeAt(0) !== 0xFFFD) { e[D[228][j]] = 58368 + j; d[58368 + j] = D[228][j];}
D[229] = "����������������������������������������������������������������蕁蘂蕋蕕薀薤薈薑薊薨蕭薔薛藪薇薜蕷蕾薐藉薺藏薹藐藕藝藥藜藹蘊蘓蘋藾藺蘆蘢蘚蘰蘿虍乕虔號虧虱蚓蚣蚩蚪蚋蚌蚶蚯蛄蛆蚰蛉蠣蚫蛔蛞蛩蛬�蛟蛛蛯蜒蜆蜈蜀蜃蛻蜑蜉蜍蛹蜊蜴蜿蜷蜻蜥蜩蜚蝠蝟蝸蝌蝎蝴蝗蝨蝮蝙蝓蝣蝪蠅螢螟螂螯蟋螽蟀蟐雖螫蟄螳蟇蟆螻蟯蟲蟠蠏蠍蟾蟶蟷蠎蟒蠑蠖蠕蠢蠡蠱蠶蠹蠧蠻衄衂衒衙衞衢衫袁衾袞衵衽袵衲袂袗袒袮袙袢袍袤袰袿袱裃裄裔裘裙裝裹褂裼裴裨裲褄褌褊褓襃褞褥褪褫襁襄褻褶褸襌褝襠襞���".split("");
for(j = 0; j != D[229].length; ++j) if(D[229][j].charCodeAt(0) !== 0xFFFD) { e[D[229][j]] = 58624 + j; d[58624 + j] = D[229][j];}
D[230] = "����������������������������������������������������������������襦襤襭襪襯襴襷襾覃覈覊覓覘覡覩覦覬覯覲覺覽覿觀觚觜觝觧觴觸訃訖訐訌訛訝訥訶詁詛詒詆詈詼詭詬詢誅誂誄誨誡誑誥誦誚誣諄諍諂諚諫諳諧�諤諱謔諠諢諷諞諛謌謇謚諡謖謐謗謠謳鞫謦謫謾謨譁譌譏譎證譖譛譚譫譟譬譯譴譽讀讌讎讒讓讖讙讚谺豁谿豈豌豎豐豕豢豬豸豺貂貉貅貊貍貎貔豼貘戝貭貪貽貲貳貮貶賈賁賤賣賚賽賺賻贄贅贊贇贏贍贐齎贓賍贔贖赧赭赱赳趁趙跂趾趺跏跚跖跌跛跋跪跫跟跣跼踈踉跿踝踞踐踟蹂踵踰踴蹊���".split("");
for(j = 0; j != D[230].length; ++j) if(D[230][j].charCodeAt(0) !== 0xFFFD) { e[D[230][j]] = 58880 + j; d[58880 + j] = D[230][j];}
D[231] = "����������������������������������������������������������������蹇蹉蹌蹐蹈蹙蹤蹠踪蹣蹕蹶蹲蹼躁躇躅躄躋躊躓躑躔躙躪躡躬躰軆躱躾軅軈軋軛軣軼軻軫軾輊輅輕輒輙輓輜輟輛輌輦輳輻輹轅轂輾轌轉轆轎轗轜�轢轣轤辜辟辣辭辯辷迚迥迢迪迯邇迴逅迹迺逑逕逡逍逞逖逋逧逶逵逹迸遏遐遑遒逎遉逾遖遘遞遨遯遶隨遲邂遽邁邀邊邉邏邨邯邱邵郢郤扈郛鄂鄒鄙鄲鄰酊酖酘酣酥酩酳酲醋醉醂醢醫醯醪醵醴醺釀釁釉釋釐釖釟釡釛釼釵釶鈞釿鈔鈬鈕鈑鉞鉗鉅鉉鉤鉈銕鈿鉋鉐銜銖銓銛鉚鋏銹銷鋩錏鋺鍄錮���".split("");
for(j = 0; j != D[231].length; ++j) if(D[231][j].charCodeAt(0) !== 0xFFFD) { e[D[231][j]] = 59136 + j; d[59136 + j] = D[231][j];}
D[232] = "����������������������������������������������������������������錙錢錚錣錺錵錻鍜鍠鍼鍮鍖鎰鎬鎭鎔鎹鏖鏗鏨鏥鏘鏃鏝鏐鏈鏤鐚鐔鐓鐃鐇鐐鐶鐫鐵鐡鐺鑁鑒鑄鑛鑠鑢鑞鑪鈩鑰鑵鑷鑽鑚鑼鑾钁鑿閂閇閊閔閖閘閙�閠閨閧閭閼閻閹閾闊濶闃闍闌闕闔闖關闡闥闢阡阨阮阯陂陌陏陋陷陜陞陝陟陦陲陬隍隘隕隗險隧隱隲隰隴隶隸隹雎雋雉雍襍雜霍雕雹霄霆霈霓霎霑霏霖霙霤霪霰霹霽霾靄靆靈靂靉靜靠靤靦靨勒靫靱靹鞅靼鞁靺鞆鞋鞏鞐鞜鞨鞦鞣鞳鞴韃韆韈韋韜韭齏韲竟韶韵頏頌頸頤頡頷頽顆顏顋顫顯顰���".split("");
for(j = 0; j != D[232].length; ++j) if(D[232][j].charCodeAt(0) !== 0xFFFD) { e[D[232][j]] = 59392 + j; d[59392 + j] = D[232][j];}
D[233] = "����������������������������������������������������������������顱顴顳颪颯颱颶飄飃飆飩飫餃餉餒餔餘餡餝餞餤餠餬餮餽餾饂饉饅饐饋饑饒饌饕馗馘馥馭馮馼駟駛駝駘駑駭駮駱駲駻駸騁騏騅駢騙騫騷驅驂驀驃�騾驕驍驛驗驟驢驥驤驩驫驪骭骰骼髀髏髑髓體髞髟髢髣髦髯髫髮髴髱髷髻鬆鬘鬚鬟鬢鬣鬥鬧鬨鬩鬪鬮鬯鬲魄魃魏魍魎魑魘魴鮓鮃鮑鮖鮗鮟鮠鮨鮴鯀鯊鮹鯆鯏鯑鯒鯣鯢鯤鯔鯡鰺鯲鯱鯰鰕鰔鰉鰓鰌鰆鰈鰒鰊鰄鰮鰛鰥鰤鰡鰰鱇鰲鱆鰾鱚鱠鱧鱶鱸鳧鳬鳰鴉鴈鳫鴃鴆鴪鴦鶯鴣鴟鵄鴕鴒鵁鴿鴾鵆鵈���".split("");
for(j = 0; j != D[233].length; ++j) if(D[233][j].charCodeAt(0) !== 0xFFFD) { e[D[233][j]] = 59648 + j; d[59648 + j] = D[233][j];}
D[234] = "����������������������������������������������������������������鵝鵞鵤鵑鵐鵙鵲鶉鶇鶫鵯鵺鶚鶤鶩鶲鷄鷁鶻鶸鶺鷆鷏鷂鷙鷓鷸鷦鷭鷯鷽鸚鸛鸞鹵鹹鹽麁麈麋麌麒麕麑麝麥麩麸麪麭靡黌黎黏黐黔黜點黝黠黥黨黯�黴黶黷黹黻黼黽鼇鼈皷鼕鼡鼬鼾齊齒齔齣齟齠齡齦齧齬齪齷齲齶龕龜龠堯槇遙瑤凜熙�������������������������������������������������������������������������������������������".split("");
for(j = 0; j != D[234].length; ++j) if(D[234][j].charCodeAt(0) !== 0xFFFD) { e[D[234][j]] = 59904 + j; d[59904 + j] = D[234][j];}
D[237] = "����������������������������������������������������������������纊褜鍈銈蓜俉炻昱棈鋹曻彅丨仡仼伀伃伹佖侒侊侚侔俍偀倢俿倞偆偰偂傔僴僘兊兤冝冾凬刕劜劦勀勛匀匇匤卲厓厲叝﨎咜咊咩哿喆坙坥垬埈埇﨏�塚增墲夋奓奛奝奣妤妺孖寀甯寘寬尞岦岺峵崧嵓﨑嵂嵭嶸嶹巐弡弴彧德忞恝悅悊惞惕愠惲愑愷愰憘戓抦揵摠撝擎敎昀昕昻昉昮昞昤晥晗晙晴晳暙暠暲暿曺朎朗杦枻桒柀栁桄棏﨓楨﨔榘槢樰橫橆橳橾櫢櫤毖氿汜沆汯泚洄涇浯涖涬淏淸淲淼渹湜渧渼溿澈澵濵瀅瀇瀨炅炫焏焄煜煆煇凞燁燾犱���".split("");
for(j = 0; j != D[237].length; ++j) if(D[237][j].charCodeAt(0) !== 0xFFFD) { e[D[237][j]] = 60672 + j; d[60672 + j] = D[237][j];}
D[238] = "����������������������������������������������������������������犾猤猪獷玽珉珖珣珒琇珵琦琪琩琮瑢璉璟甁畯皂皜皞皛皦益睆劯砡硎硤硺礰礼神祥禔福禛竑竧靖竫箞精絈絜綷綠緖繒罇羡羽茁荢荿菇菶葈蒴蕓蕙�蕫﨟薰蘒﨡蠇裵訒訷詹誧誾諟諸諶譓譿賰賴贒赶﨣軏﨤逸遧郞都鄕鄧釚釗釞釭釮釤釥鈆鈐鈊鈺鉀鈼鉎鉙鉑鈹鉧銧鉷鉸鋧鋗鋙鋐﨧鋕鋠鋓錥錡鋻﨨錞鋿錝錂鍰鍗鎤鏆鏞鏸鐱鑅鑈閒隆﨩隝隯霳霻靃靍靏靑靕顗顥飯飼餧館馞驎髙髜魵魲鮏鮱鮻鰀鵰鵫鶴鸙黑��ⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ￢￤＇＂���".split("");
for(j = 0; j != D[238].length; ++j) if(D[238][j].charCodeAt(0) !== 0xFFFD) { e[D[238][j]] = 60928 + j; d[60928 + j] = D[238][j];}
D[250] = "����������������������������������������������������������������ⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ￢￤＇＂㈱№℡∵纊褜鍈銈蓜俉炻昱棈鋹曻彅丨仡仼伀伃伹佖侒侊侚侔俍偀倢俿倞偆偰偂傔僴僘兊�兤冝冾凬刕劜劦勀勛匀匇匤卲厓厲叝﨎咜咊咩哿喆坙坥垬埈埇﨏塚增墲夋奓奛奝奣妤妺孖寀甯寘寬尞岦岺峵崧嵓﨑嵂嵭嶸嶹巐弡弴彧德忞恝悅悊惞惕愠惲愑愷愰憘戓抦揵摠撝擎敎昀昕昻昉昮昞昤晥晗晙晴晳暙暠暲暿曺朎朗杦枻桒柀栁桄棏﨓楨﨔榘槢樰橫橆橳橾櫢櫤毖氿汜沆汯泚洄涇浯���".split("");
for(j = 0; j != D[250].length; ++j) if(D[250][j].charCodeAt(0) !== 0xFFFD) { e[D[250][j]] = 64000 + j; d[64000 + j] = D[250][j];}
D[251] = "����������������������������������������������������������������涖涬淏淸淲淼渹湜渧渼溿澈澵濵瀅瀇瀨炅炫焏焄煜煆煇凞燁燾犱犾猤猪獷玽珉珖珣珒琇珵琦琪琩琮瑢璉璟甁畯皂皜皞皛皦益睆劯砡硎硤硺礰礼神�祥禔福禛竑竧靖竫箞精絈絜綷綠緖繒罇羡羽茁荢荿菇菶葈蒴蕓蕙蕫﨟薰蘒﨡蠇裵訒訷詹誧誾諟諸諶譓譿賰賴贒赶﨣軏﨤逸遧郞都鄕鄧釚釗釞釭釮釤釥鈆鈐鈊鈺鉀鈼鉎鉙鉑鈹鉧銧鉷鉸鋧鋗鋙鋐﨧鋕鋠鋓錥錡鋻﨨錞鋿錝錂鍰鍗鎤鏆鏞鏸鐱鑅鑈閒隆﨩隝隯霳霻靃靍靏靑靕顗顥飯飼餧館馞驎髙���".split("");
for(j = 0; j != D[251].length; ++j) if(D[251][j].charCodeAt(0) !== 0xFFFD) { e[D[251][j]] = 64256 + j; d[64256 + j] = D[251][j];}
D[252] = "����������������������������������������������������������������髜魵魲鮏鮱鮻鰀鵰鵫鶴鸙黑������������������������������������������������������������������������������������������������������������������������������������������������������������������������������������".split("");
for(j = 0; j != D[252].length; ++j) if(D[252][j].charCodeAt(0) !== 0xFFFD) { e[D[252][j]] = 64512 + j; d[64512 + j] = D[252][j];}
return {"enc": e, "dec": d }; })();
