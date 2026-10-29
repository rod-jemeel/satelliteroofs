"""Credential-free native PDF inspector, invoked only in a bounded child."""
import re, json, sys, hashlib
from pathlib import Path
from collections import defaultdict
import pdfplumber
import pypdfium2 as pdfium
from .measurements import normalize

PATTERNS = [
 ('roof_area', r'(?:total\s+roof\s+area|roof\s+surface\s+area|total\s+area)'),
 ('ridge_hip_length', r'(?:ridge\s*[+&/]\s*hips?|ridges?\s+and\s+hips?)'),
 ('ridge_length', r'(?:ridges?|ridge\s+length)'),('hip_length',r'(?:hips?|hip\s+length)'),
 ('eave_length',r'(?:eaves?|eave\s+length)'),('rake_length',r'(?:rakes?|rake\s+length)'),
 ('valley_length',r'(?:valleys?|valley\s+length)'),('step_flashing_length',r'step\s+flashing'),
 ('headwall_length',r'headwall(?:\s+flashing)?'),('penetration_count',r'(?:penetrations?|pipe\s+boots?)'),('facet_pitch',r'(?:pitch|predominant\s+pitch)')]

def inspect_pdf(path: Path, output_dir: Path|None=None) -> dict:
    path=Path(path)
    if path.stat().st_size>25*1024*1024: raise ValueError('PDF exceeds 25 MB limit')
    try:
        doc=pdfium.PdfDocument(str(path))
    except Exception: raise ValueError('Unsupported, corrupt or encrypted PDF. Supply a valid unlocked copy.')
    try:
        if len(doc)>40: raise ValueError('PDF exceeds 40-page limit')
        with pdfplumber.open(path) as pdf:
            result={'pages':[], 'observations':[], 'issues':[], 'support':'generic_unvalidated', 'quality':'partial', 'adapter_version':'native-1.0', 'renderer_version':str(pdfium.PYPDFIUM_INFO), 'provider':'Generic PDF (unvalidated layout)'}
            fulltext=''; candidates=[]
            for i,page in enumerate(pdf.pages):
                if page.width>4000 or page.height>4000 or page.width<=0 or page.height<=0: raise ValueError('Unsupported page dimensions')
                if len(page.chars)>150000 or len(page.images)>100: raise ValueError('Page exceeds document resource limits')
                if any(int(x.get('srcsize',(0,0))[0])*int(x.get('srcsize',(0,0))[1])>60000000 for x in page.images): raise ValueError('Decompressed image dimensions exceed limits')
                crop=page.cropbox or page.bbox
                visible=page.crop(crop,strict=False)
                words=visible.extract_words(x_tolerance=2,y_tolerance=3)
                if len(words)>25000: raise ValueError('Page text exceeds token budget')
                tokens=[]
                for j,w in enumerate(words):
                    bbox=[(w['x0']-crop[0])/visible.width,(w['top']-crop[1])/visible.height,(w['x1']-crop[0])/visible.width,(w['bottom']-crop[1])/visible.height]
                    upright=w.get('upright',True)
                    tokens.append({'id':f'p{i+1}_t{j+1}','text':w['text'],'bbox':[max(0,min(1,round(v,6))) for v in bbox], 'top':('h' if upright else 'v')+str(round((w['top'] if upright else w['x0'])/3)*3),'upright':upright})
                lines=defaultdict(list)
                for t in tokens:lines[t['top']].append(t)
                page_text='\n'.join(' '.join(t['text'] for t in sorted(line,key=lambda t:t['bbox'][0 if t['upright'] else 1])) for line in lines.values());fulltext+='\n'+page_text
                low=page_text.lower()
                classification='summary' if re.search(r'total\s+roof\s+area|measurement summary',low) else 'length_diagram' if 'roof drawing' in low else 'other'
                manifest={'page_number':i+1,'label':str(i+1),'media_box':list(page.mediabox),'crop_box':list(crop),'rotation':page.rotation,'user_unit':page.page_obj.attrs.get('UserUnit',1),'width':doc[i].get_width(),'height':doc[i].get_height(),'classification':classification,'tokens':tokens,'coordinate_space':'visible_crop_intrinsic_rotation_top_left_normalized','source_space':'pdfplumber_rotated_media_top_left','transform':{'translate':[-crop[0],-crop[1]],'scale':[1/visible.width,1/visible.height]},'render_width':round(doc[i].get_width()*1.5),'render_height':round(doc[i].get_height()*1.5)}
                if output_dir:
                    output_dir.mkdir(parents=True,exist_ok=True);doc[i].render(scale=1.5).to_pil().save(output_dir/f'page-{i+1}.png')
                result['pages'].append(manifest)
                if len(words)<8:
                    result['issues'].append({'code':'scan_needs_review','message':f'Page {i+1} has little native text. OCR/vision has not been validated; inspect this page and enter values manually.','severity':'required','page_number':i+1})
                for line in lines.values():
                    line=sorted(line,key=lambda t:t['bbox'][0 if t['upright'] else 1]);raw=' '.join(t['text'] for t in line)
                    for field,pattern in PATTERNS:
                        match=re.match(r'\s*'+pattern+r'\s*[:=]?\s+(.+)$',raw,re.I)
                        if not match:continue
                        tail=match[1].strip()
                        unit='pitch' if field=='facet_pitch' else 'count' if field=='penetration_count' else None
                        if not unit:
                            um=re.search(r'\s+(sq\s*ft|ft2|sq\.?\s*feet|square\s*feet|ft|feet|lf|m2|m|squares?)\b',tail,re.I)
                            unit={'sq ft':'ft2','ft2':'ft2','square feet':'ft2','sq feet':'ft2','ft':'ft','feet':'ft','lf':'ft','m':'m','m2':'m2','square':'square','squares':'square'}.get(re.sub(r'\s+',' ',um[1].lower()).replace('.','')) if um else None
                            numeric=tail[:um.start()].strip() if um else tail
                        else: numeric=re.sub(r'\s+(?:count|each)$','',tail,flags=re.I)
                        if field=='facet_pitch':numeric=tail
                        try:value=normalize(numeric,unit or 'unknown')
                        except ValueError:value=None
                        bbox=[min(t['bbox'][0] for t in line),min(t['bbox'][1] for t in line),max(t['bbox'][2] for t in line),max(t['bbox'][3] for t in line)]
                        candidate={'id':'obs_'+hashlib.sha256(f'{i}:{raw}'.encode()).hexdigest()[:16],'field':field,'value':value,'unit':'ft2' if unit in ('m2','square') else 'ft' if unit=='m' else unit,'raw_text':raw,'method':'native_text','quality':'source_supported' if value is not None else 'missing','review_status':'unreviewed','structure_id':'main','facet_id':None,'area_basis':'unknown','waste_included':False,'evidence':[{'page_number':i+1,'token_ids':[t['id'] for t in line],'bbox_normalized':bbox,'location_quality':'token_derived'}]}
                        candidates.append(candidate);break
            known_fixture=Path(__file__).resolve().parents[3]/'fixtures/demo-roof-report.pdf'
            synthetic='RoofReady Synthetic Layout v1' in fulltext and known_fixture.exists() and hashlib.sha256(path.read_bytes()).digest()==hashlib.sha256(known_fixture.read_bytes()).digest()
            if synthetic: result.update(support='tested_synthetic_v1',provider='RoofReady synthetic layout v1')
            multiple=bool(re.search(r'detached\s+garage',fulltext,re.I)) and not bool(re.search(r'no\s+detached\s+garage',fulltext,re.I))
            if multiple:result['issues'].append({'code':'multiple_structures','message':'Multiple structures detected. Assign and explicitly select scope; aggregate totals are not automatically accepted.','severity':'required'})
            for c in candidates:
                if c['field']=='roof_area':
                    c['area_basis']='sloped_surface' if re.search(r'sloped\s+surface|roof\s+surface',fulltext,re.I) or synthetic else 'unknown'
                    c['waste_included']=bool(re.search(r'(?:area\s+includes\s+waste|waste.adjusted\s+area)',c['raw_text'],re.I))
                matches=[x for x in result['observations'] if x['field']==c['field'] and x['value']==c['value']]
                if matches and not multiple:matches[0]['evidence'].extend(c['evidence']);continue
                result['observations'].append(c)
            for c in result['observations']:
                peers=[x for x in result['observations'] if x['field']==c['field']]
                if len({x['value'] for x in peers})>1 or (multiple and c['field']=='roof_area'):
                    c['quality']='conflicting'
                    if not any(x['code']=='conflicting_'+c['field'] for x in result['issues']):result['issues'].append({'code':'conflicting_'+c['field'],'message':f'Conflicting {c["field"].replace("_"," ")} candidates require review.','severity':'required'})
            if not synthetic: result['issues'].append({'code':'unknown_layout','message':'Generic extraction only. This layout has no reviewed provider adapter. Confirm units, area basis and structure scope manually.','severity':'review'})
            if synthetic and not result['issues']:result['quality']='source_supported'
            return result
    except ValueError:raise
    except Exception:raise ValueError('PDF inspection failed safely. Try a native unlocked PDF or use manual entry.')
    finally:doc.close()

if __name__=='__main__':
    try:
        from .process_limits import limit_current_process
        limit_current_process()
        result=inspect_pdf(Path(sys.argv[1]),Path(sys.argv[2]));temp=Path(sys.argv[2],'manifest.tmp');temp.write_text(json.dumps(result),'utf8');temp.replace(Path(sys.argv[2],'manifest.json'))
    except Exception as e:
        print(str(e),file=sys.stderr);sys.exit(2)
