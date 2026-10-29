from pathlib import Path
from html import escape
import json,csv,io
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

def export_data(project,estimate,audience):
    d=estimate.data
    common=dict(project=project.name,address=project.address,revision=estimate.seq,measurement_revision=d['measurement_seq'],status=estimate.status,date=estimate.created_at,scope=d['scope'],currency='USD',selling_price=d['selling_price'],tax=d['tax'],total=d['total'],assumptions=d['assumptions'],exclusions=d['exclusions'],issues=d['issues'],demo_data=True)
    if audience=='internal':common.update(d)
    return common

def render(project,estimate,audience,fmt,path):
    data=export_data(project,estimate,audience)
    if fmt=='json':path.write_text(json.dumps(data,indent=2),'utf8');return
    if fmt=='csv':
        with path.open('w',newline='',encoding='utf8') as f:
            w=csv.writer(f)
            if audience=='customer':
                w.writerow(['Project','Revision','Status','Selling price','Tax','Total']);w.writerow([data['project'],data['revision'],data['status'],data['selling_price'],data['tax'],data['total']])
            else:
                w.writerow(['SKU','Description','Demand','Ordered','Unit','Unit cost','Line cost','Formula','Explanation'])
                for l in data['lines']:w.writerow([l['sku'],l['name'],l['demand'],l['ordered_quantity'],l['unit'],l['unit_price'],l['line_cost'],l['formula_id'],l['explanation']])
        return
    styles=getSampleStyleSheet();story=[]
    def p(t,style='BodyText'):story.append(Paragraph(escape(str(t)),styles[style]));story.append(Spacer(1,9))
    p('SatelliteRoofs / '+('Internal estimate' if audience=='internal' else 'Roofing proposal'),'Title')
    p(data['project'],'Heading2');p(data['address'] or 'Property address not supplied')
    p(f'Revision {data["revision"]} | Measurements {data["measurement_revision"]} | {data["status"].replace("_"," ")} | {data["date"][:10]}')
    p('DEMO DATA - Synthetic specifications and prices. For prototype review only.')
    p('Selected scope: '+', '.join(data['scope']))
    if data['issues']:
        p('Partial / unresolved scope','Heading2')
        for issue in data['issues']:p(issue['message'])
    if audience=='internal':
        rows=[['Item','Order','Unit price','Cost']]
        for l in data['lines']:rows.append([Paragraph(escape(l['name']),styles['BodyText']),l['ordered_quantity']+' '+l['unit'],'$'+l['unit_price'],'$'+l['line_cost']])
        t=Table(rows,colWidths=[250,90,70,70],repeatRows=1);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E8EEF6')),('VALIGN',(0,0),(-1,-1),'TOP'),('BOTTOMPADDING',(0,0),(-1,-1),9),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#D7DFE8'))]));story.append(t)
        p('Direct cost: $'+data['direct_cost']);p('Gross profit: $'+data['gross_profit']);p('Actual gross margin: '+str(round(float(data['actual_margin'])*100,2))+'%')
    p('Selling price before tax: $'+data['selling_price'],'Heading2');p('Configured tax: $'+data['tax']);p('Total: $'+data['total'],'Heading2')
    for heading,key in [('Assumptions','assumptions'),('Exclusions','exclusions')]:
        p(heading,'Heading2')
        for item in data[key]:p(item)
    if audience=='internal':
        p('Calculation trace','Heading1')
        for l in data['lines']:
            p(l['name'],'Heading3');p(l['explanation']);p('Formula '+l['formula_id']+' / '+l['formula_version']);p('Demand '+l['demand']+'; ordered '+l['ordered_quantity']+'; surplus '+l['surplus']);p(l['rounding'])
    SimpleDocTemplate(str(path),pagesize=(612,792),rightMargin=42,leftMargin=42,topMargin=42,bottomMargin=42,title='SatelliteRoofs Estimate').build(story)
