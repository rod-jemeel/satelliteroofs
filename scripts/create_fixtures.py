"""Redistributable synthetic report fixtures. No vendor layout claims."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.lib.pdfencrypt import StandardEncryption
import io
import pypdfium2 as pdfium

ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'fixtures';OUT.mkdir(exist_ok=True)
def roof(c):
    c.setFillColor(HexColor('#F0F4FA'));c.rect(45,115,522,525,fill=1,stroke=0)
    c.setStrokeColor(HexColor('#3D596F'));c.setLineWidth(2)
    points=[(140,235),(140,520),(260,600),(395,520),(395,450),(475,450),(475,235)]
    p=c.beginPath();p.moveTo(*points[0])
    for xy in points[1:]:p.lineTo(*xy)
    p.close();c.setFillColor(HexColor('#E2EBF5'));c.drawPath(p,fill=1,stroke=1)
    c.setLineWidth(2.5);c.setStrokeColor(HexColor('#245BCB'))
    for coords in [(260,315,260,520),(260,520,140,520),(260,520,395,520),(260,315,140,235),(260,315,395,235),(260,520,260,600),(260,385,395,450),(395,450,475,450)]:c.line(*coords)
    c.setFillColor(HexColor('#334D65'));c.setFont('Helvetica',12)
    for x,y,t in [(177,399,'A • 960 ft²'),(300,466,'B • 720 ft²'),(318,280,'C • 480 ft²'),(402,345,'D • 240 ft²')]:c.drawString(x,y,t.replace('•','/').replace('²','2'))
    c.setFont('Helvetica',10)
    for x,y,t in [(102,370,"60'"),(225,214,"72'"),(260,540,'6 / 12'),(410,465,"20'")]:c.drawString(x,y,t)
    c.setFont('Helvetica',9);c.drawString(68,138,'Synthetic drawing / report-space geometry / not a geographic overlay')

def header(c,title):
    c.setFillColor(HexColor('#172A3A'));c.rect(0,700,612,92,fill=1,stroke=0)
    c.setFillColor(HexColor('#FFFFFF'));c.setFont('Helvetica-Bold',23);c.drawString(42,748,'RoofReady  /  Measurement report')
    c.setFont('Helvetica',11);c.drawString(42,724,title)
    c.setFillColor(HexColor('#657587'));c.setFont('Helvetica',9);c.drawString(42,45,'DEMO DATA - Synthetic report. Not an EagleView or other provider report.')

def create():
    p=OUT/'demo-roof-report.pdf';c=canvas.Canvas(str(p),pagesize=(612,792));c.setTitle('RoofReady Synthetic Layout v1')
    header(c,'Oakridge residence / Main house / October 25, 2026')
    c.setFillColor(HexColor('#172A3A'));c.setFont('Helvetica-Bold',18);c.drawString(42,657,'Roof measurement summary')
    c.setFont('Helvetica',10);c.drawString(42,635,'RoofReady Synthetic Layout v1 / Main house / Surface area / No waste included')
    rows=[('Total Roof Area','2,400 sq ft'),('Ridge + Hip','140 ft'),('Eaves','180 ft'),('Rakes','120 ft'),('Valleys','40 ft'),('Step flashing','0 ft'),('Headwall flashing','0 ft'),('Penetrations','3 count'),('Pitch','6/12')]
    for i,(k,v) in enumerate(rows):
        y=585-i*43;c.setFillColor(HexColor('#F3F6F9' if i%2==0 else '#FFFFFF'));c.rect(40,y-13,532,35,fill=1,stroke=0)
        c.setFillColor(HexColor('#172A3A'));c.setFont('Helvetica',12);c.drawString(54,y,k+':');c.setFont('Helvetica-Bold',12);c.drawString(405,y,v)
    c.setFont('Helvetica',10);c.drawString(42,160,'Area basis: sloped surface. This source excludes material waste.')
    c.drawString(42,143,'One asphalt shingle structure. No detached garage is included.')
    c.showPage();header(c,'Roof drawing / source page 2');roof(c);c.showPage();c.save()
    doc=pdfium.PdfDocument(str(p));im=doc[0].render(scale=1.25).to_pil();b=io.BytesIO();im.save(b,format='PNG');doc.close()
    c=canvas.Canvas(str(OUT/'scanned-report.pdf'),pagesize=(612,792));c.drawImage(ImageReader(io.BytesIO(b.getvalue())),0,0,width=612,height=792);c.save()
    c=canvas.Canvas(str(OUT/'rotated-cropped.pdf'),pagesize=(612,792));c.setPageRotation(90);c.setCropBox((40,40,750,570));c.setFont('Helvetica',14);c.drawString(100,200,'Total Roof Area: 2,400 sq ft');c.save()
    c=canvas.Canvas(str(OUT/'multiple-structures.pdf'),pagesize=(612,792));c.setFont('Helvetica',14)
    for i,t in enumerate(['Main house','Total Roof Area: 2,400 sq ft','Detached garage','Total Roof Area: 480 sq ft']):c.drawString(40,700-40*i,t)
    c.save()
    c=canvas.Canvas(str(OUT/'encrypted.pdf'),encrypt=StandardEncryption('unlock-me'));c.drawString(40,700,'Locked fixture');c.save()
    print('Created five synthetic PDF fixtures.')
if __name__=='__main__':create()
