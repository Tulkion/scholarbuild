import React, { useState } from 'react';
import { Workspace } from '../../types';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, Download, Bot, Brain } from 'lucide-react';
import { getGenAI } from '../../lib/gemini';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import ReactMarkdown from 'react-markdown';
import html2pdf from 'html2pdf.js';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

export default function PapersTab({ workspace }: { workspace: Workspace }) {
  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState<'paper_pdf' | 'paper_word' | 'presentation'>('paper_pdf');
  const [highThinking, setHighThinking] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setResult(null);
    try {
      // Fetch user's docs from firestore to ground the Generation
      const docsSnap = await getDocs(query(collection(db, 'documents'), where('workspaceId', '==', workspace.id)));
      let sourcesContext = '';
      docsSnap.forEach(d => {
         const data = d.data();
         sourcesContext += `\n--- SOURCE: ${data.title} ---\n${data.content}\n`;
      });

      const ai = getGenAI();
      const modelName = highThinking ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";
      
      let systemInstruction = `You are ScholarSpace, an academic writer and generator. 
Use the following sources to fulfill the user's request:
${sourcesContext}
`;
      if (format.startsWith('paper')) {
          systemInstruction += `\nGenerate a complete, well-structured academic paper or essay. Use clear headings, subheadings, and academic tone. Format entirely in Markdown. DO NOT wrap with \`\`\`markdown, just return the text.`;
      } else {
          systemInstruction += `\nGenerate a presentation slide deck. For each slide, provide a clear Slide Title, Bullet Points, and Speaker Notes. Format entirely in Markdown. Use clear horizontal rules (---) between slides or clear '## Slide X' headers.`;
      }

      const contents = `User Request: ${prompt}`;

      const config: any = {
         systemInstruction,
         ...(highThinking ? { thinkingConfig: { thinkingLevel: 'HIGH' } } : {})
      };

      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config
      });

      let genText = response.text || '';
      
      // Clean up markdown block wrapping if model included it
      if (genText.startsWith('```markdown')) genText = genText.replace(/^```markdown\n/, '').replace(/\n```$/, '');
      if (genText.startsWith('```')) genText = genText.replace(/^```\n/, '').replace(/\n```$/, '');
      
      setResult(genText);

      // Save to assets history
      await addDoc(collection(db, 'assets'), {
         workspaceId: workspace.id,
         userId: workspace.userId,
         type: format.includes('paper') ? 'paper' : 'presentation',
         title: prompt.substring(0, 50) + '...',
         content: genText,
         createdAt: new Date().toISOString()
      });
    } catch (e: any) {
      console.error(e);
      alert("Failed to generate: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPDF = () => {
     if (!result) return;
     const element = document.getElementById('generated-output');
     if (!element) return;
     const opt = {
       margin:       0.75,
       filename:     'ScholarSpace-Export.pdf',
       image:        { type: 'jpeg' as const, quality: 0.98 },
       html2canvas:  { scale: 2 },
       jsPDF:        { unit: 'in', format: 'letter', orientation: (format === 'presentation' ? 'landscape' : 'portrait') as 'landscape' | 'portrait' }
     };
     html2pdf().set(opt).from(element).save();
  };

  const handleDownloadWord = async () => {
      if (!result) return;
      // very basic markdown to word generic convert
      const lines = result.split('\n');
      const paragraphs = lines.map(line => {
          if (line.startsWith('# ')) {
              return new Paragraph({ text: line.replace('# ', ''), heading: HeadingLevel.HEADING_1 });
          } else if (line.startsWith('## ')) {
             return new Paragraph({ text: line.replace('## ', ''), heading: HeadingLevel.HEADING_2 });
          } else if (line.startsWith('### ')) {
             return new Paragraph({ text: line.replace('### ', ''), heading: HeadingLevel.HEADING_3 });
          } else if (line.trim() === '') {
             return new Paragraph({ text: '' });
          } else {
             return new Paragraph({
                 children: [new TextRun(line)]
             });
          }
      });
      const doc = new Document({
          creator: "ScholarSpace",
          sections: [{
              properties: {},
              children: paragraphs
          }]
      });

      const buffer = await Packer.toBlob(doc);
      saveAs(buffer, "ScholarSpace-Paper.docx");
  };

  return (
    <div className="flex w-full h-full gap-4">
      <div className="w-[340px] bg-natural-sidebar rounded-[16px] shadow-sm border border-natural-border flex flex-col p-5 space-y-6 overflow-y-auto shadow-card">
         <div className="pb-4 border-b border-natural-border">
           <h2 className="text-[1.1rem] font-serif font-bold text-natural-text">Gerador de Monografia</h2>
           <p className="text-[0.8rem] text-natural-muted mt-1 leading-relaxed">Gere trabalhos completos e apresentações com base em suas fontes.</p>
         </div>

         <div className="space-y-4 text-[0.85rem] font-medium">
             <div className="space-y-2">
                 <label className="text-natural-muted uppercase tracking-wider text-[0.7rem] font-bold">Prompt / Topic</label>
                 <Textarea 
                   className="min-h-[140px] resize-none text-[0.85rem] p-4 bg-[#FAFAFA] border-natural-border focus:border-natural-accent rounded-[12px]" 
                   value={prompt}
                   onChange={e => setPrompt(e.target.value)}
                   placeholder="e.g., Write a 5-paragraph essay on..."
                 />
             </div>

             <div className="space-y-2">
                 <label className="text-natural-muted uppercase tracking-wider text-[0.7rem] font-bold">Format</label>
                 <Select value={format} onValueChange={(v: any) => setFormat(v)}>
                     <SelectTrigger className="w-full h-11 rounded-[12px] bg-[#FAFAFA] border-natural-border">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                         <SelectItem value="paper_pdf">Academic Paper (PDF)</SelectItem>
                         <SelectItem value="paper_word">Academic Paper (Word)</SelectItem>
                         <SelectItem value="presentation">Presentation Slides (PDF)</SelectItem>
                     </SelectContent>
                 </Select>
             </div>

             <div className="flex items-center justify-between p-3 bg-natural-bg border border-natural-border rounded-[12px]">
                 <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-natural-accent" />
                    <span className="text-natural-text font-bold text-xs">High Thinking Mode</span>
                 </div>
                 <input type="checkbox" checked={highThinking} onChange={e => setHighThinking(e.target.checked)} className="rounded accent-natural-accent h-4 w-4" />
             </div>

             <Button 
                className="w-full h-[46px] rounded-[12px] bg-natural-accent text-white font-bold transition-colors" 
                onClick={handleGenerate}
                disabled={generating || !prompt.trim()}
             >
                 {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                 {generating ? "Generating..." : "Generate Asset"}
             </Button>
         </div>
      </div>

      <div className="flex-1 bg-white rounded-[16px] shadow-card border border-natural-border flex flex-col overflow-hidden relative">
         <div className="border-b border-natural-border p-4 flex justify-between items-center bg-transparent">
             <div className="font-serif font-bold text-natural-text text-[1.1rem]">Preview</div>
             <div className="flex gap-2">
                 {format.includes('word') && (
                     <Button size="sm" variant="outline" className="border-natural-accent text-natural-accent bg-transparent hover:bg-natural-accent hover:text-white" onClick={handleDownloadWord} disabled={!result}>
                        <Download className="w-4 h-4 mr-2" /> Baixar Word (.docx)
                     </Button>
                 )}
                 {(format === 'paper_pdf' || format === 'presentation') && (
                     <Button size="sm" variant="outline" className="border-natural-accent text-natural-accent bg-transparent hover:bg-natural-accent hover:text-white" onClick={handleDownloadPDF} disabled={!result}>
                        <Download className="w-4 h-4 mr-2" /> Exportar PDF
                     </Button>
                 )}
             </div>
         </div>
         <div className="flex-1 overflow-y-auto p-8 bg-[#F4F4F0]">
             {generating ? (
                 <div className="w-full h-full flex flex-col items-center justify-center text-natural-muted space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="font-serif">Drafting your content using High Thinking mode...</p>
                 </div>
             ) : result ? (
                 <div id="generated-output" className="bg-white p-10 max-w-3xl mx-auto shadow-sm border border-natural-border rounded-[4px] min-h-full">
                    <div className="prose prose-sm prose-zinc max-w-none print:text-xs text-natural-text font-serif leading-relaxed">
                        <ReactMarkdown>{result}</ReactMarkdown>
                    </div>
                 </div>
             ) : (
                 <div className="w-full h-full flex items-center justify-center text-natural-muted font-serif">
                     Generated output will appear here.
                 </div>
             )}
         </div>
      </div>
    </div>
  );
}
