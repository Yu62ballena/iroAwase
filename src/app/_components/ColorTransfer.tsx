'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

// --- Types ---

interface ImageState {
    file: File | null;
    url: string | null;
    element: HTMLImageElement | null;
    width: number;
    height: number;
}

interface ProcessStatus {
    isProcessing: boolean;
    message: string;
    progress: number;
}

// --- Constants ---

const RESIZE_LONG_EDGE = 3000; // Updated to 3000px as requestedConversion Helpers ---

// RGB to LMS Matrix
const M_RGB2LMS = [
    [0.3811, 0.5783, 0.0402],
    [0.1967, 0.7244, 0.0782],
    [0.0241, 0.1288, 0.8444]
];

// LMS to lαβ Matrix
const M_LMS2LAB = [
    [1 / Math.sqrt(3), 0, 0],
    [0, 1 / Math.sqrt(6), 0],
    [0, 0, 1 / Math.sqrt(2)]
].map((row, i) => {
    const m2 = [
        [1, 1, 1],
        [1, 1, -2],
        [1, -1, 0]
    ];
    // Multiply diagonal matrix with m2
    return m2[i].map(val => val * row[i]);
});
// Simplify:
// L = (1/sqrt(3)) * (l + m + s)
// a = (1/sqrt(6)) * (l + m - 2s)
// b = (1/sqrt(2)) * (l - m)
// But standard papers often use pre-calculated floats. Let's use standard values.
// Standard Reinhard matrices often used:
// RGB->LMS
const MAT_RGB2LMS = [
    0.3811, 0.5783, 0.0402,
    0.1967, 0.7244, 0.0782,
    0.0241, 0.1288, 0.8444
];
// LMS->RGB
const MAT_LMS2RGB = [
    4.4679, -3.5873, 0.1193,
    -1.2186, 2.3809, -0.1624,
    0.0497, -0.2439, 1.2045
];
// LMS->lab
const MAT_LMS2LAB = [
    0.5774, 0.5774, 0.5774,
    0.4082, 0.4082, -0.8165,
    0.7071, -0.7071, 0.0000
];
// lab->LMS
const MAT_LAB2LMS = [
    0.5774, 0.4082, 0.7071,
    0.5774, 0.4082, -0.7071,
    0.5774, -0.8165, 0.0000
];


// --- Helper Functions ---

const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};

const resizeImageCanvas = (img: HTMLImageElement, longEdge: number = 2400): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number } => {
    const canvas = document.createElement('canvas');
    let width = img.width;
    let height = img.height;

    if (width > longEdge || height > longEdge) {
        if (width > height) {
            height = Math.round(height * (longEdge / width));
            width = longEdge;
        } else {
            width = Math.round(width * (longEdge / height));
            height = longEdge;
        }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    return { canvas, ctx, width, height };
};


// --- Math & Color Logic ---

const sRGBToLinear = (x: number): number => {
    x /= 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

const linearToSRGB = (x: number): number => {
    const val = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(Math.min(255, Math.max(0, val * 255)));
};

const rgb2lab = (r: number, g: number, b: number): [number, number, number] => {
    // Convert sRGB (0-255) to Linear RGB (0-1)
    r = sRGBToLinear(r);
    g = sRGBToLinear(g);
    b = sRGBToLinear(b);

    // Linear RGB to LMS
    // Avoid log(0) with a tiny epsilon
    const EPSILON = 1e-4; // Small value for linear space

    const L = Math.max(EPSILON, MAT_RGB2LMS[0] * r + MAT_RGB2LMS[1] * g + MAT_RGB2LMS[2] * b);
    const M = Math.max(EPSILON, MAT_RGB2LMS[3] * r + MAT_RGB2LMS[4] * g + MAT_RGB2LMS[5] * b);
    const S = Math.max(EPSILON, MAT_RGB2LMS[6] * r + MAT_RGB2LMS[7] * g + MAT_RGB2LMS[8] * b);

    const l_ = Math.log10(L);
    const m_ = Math.log10(M);
    const s_ = Math.log10(S);

    const l = MAT_LMS2LAB[0] * l_ + MAT_LMS2LAB[1] * m_ + MAT_LMS2LAB[2] * s_;
    const a = MAT_LMS2LAB[3] * l_ + MAT_LMS2LAB[4] * m_ + MAT_LMS2LAB[5] * s_;
    const b_ = MAT_LMS2LAB[6] * l_ + MAT_LMS2LAB[7] * m_ + MAT_LMS2LAB[8] * s_;

    return [l, a, b_];
};

const lab2rgb = (l: number, a: number, b: number): [number, number, number] => {
    const l_ = MAT_LAB2LMS[0] * l + MAT_LAB2LMS[1] * a + MAT_LAB2LMS[2] * b;
    const m_ = MAT_LAB2LMS[3] * l + MAT_LAB2LMS[4] * a + MAT_LAB2LMS[5] * b;
    const s_ = MAT_LAB2LMS[6] * l + MAT_LAB2LMS[7] * a + MAT_LAB2LMS[8] * b;

    const L = Math.pow(10, l_);
    const M = Math.pow(10, m_);
    const S = Math.pow(10, s_);

    let rLine = MAT_LMS2RGB[0] * L + MAT_LMS2RGB[1] * M + MAT_LMS2RGB[2] * S;
    let gLine = MAT_LMS2RGB[3] * L + MAT_LMS2RGB[4] * M + MAT_LMS2RGB[5] * S;
    let bLine = MAT_LMS2RGB[6] * L + MAT_LMS2RGB[7] * M + MAT_LMS2RGB[8] * S;

    return [
        linearToSRGB(rLine),
        linearToSRGB(gLine),
        linearToSRGB(bLine)
    ];
};

interface ColorStats {
    mean: [number, number, number];
    std: [number, number, number];
}

const computeStats = (ctx: CanvasRenderingContext2D, width: number, height: number): ColorStats => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Use typed arrays for performance
    const lVals: number[] = [];
    const aVals: number[] = [];
    const bVals: number[] = [];

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Filtering white clipping and black crushing
        if (r > 250 && g > 250 && b > 250) continue;
        if (r < 5 && g < 5 && b < 5) continue;

        const [l, a, bb] = rgb2lab(r, g, b);
        lVals.push(l);
        aVals.push(a);
        bVals.push(bb);
    }

    // Calculate Mean
    const n = lVals.length;
    if (n === 0) return { mean: [0, 0, 0], std: [1, 1, 1] }; // Fallback

    const meanL = lVals.reduce((a, c) => a + c, 0) / n;
    const meanA = aVals.reduce((a, c) => a + c, 0) / n;
    const meanB = bVals.reduce((a, c) => a + c, 0) / n;

    // Calculate Std
    const varL = lVals.reduce((a, c) => a + Math.pow(c - meanL, 2), 0) / n;
    const varA = aVals.reduce((a, c) => a + Math.pow(c - meanA, 2), 0) / n;
    const varB = bVals.reduce((a, c) => a + Math.pow(c - meanB, 2), 0) / n;

    return {
        mean: [meanL, meanA, meanB],
        std: [Math.sqrt(varL), Math.sqrt(varA), Math.sqrt(varB)]
    };
};

// --- Component ---

export default function ColorTransfer() {
    const [reference, setReference] = useState<ImageState>({ file: null, url: null, element: null, width: 0, height: 0 });
    const [target, setTarget] = useState<ImageState>({ file: null, url: null, element: null, width: 0, height: 0 });
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [processStatus, setProcessStatus] = useState<ProcessStatus>({ isProcessing: false, message: '', progress: 0 });
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);

    // -- Handlers --

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLElement>, type: 'reference' | 'target') => {
        e.preventDefault();
        let files: FileList | null = null;
        if ('dataTransfer' in e) {
            files = e.dataTransfer.files;
        } else if ('target' in e && e.target instanceof HTMLInputElement) {
            files = e.target.files;
        }

        if (files && files.length > 0) {
            const file = files[0];
            if (file.size > 5 * 1024 * 1024) {
                setErrorMessage("File too large. Max 5MB.");
                return;
            }
            if (!file.type.match('image.*')) {
                setErrorMessage("Only image files are allowed.");
                return;
            }

            setErrorMessage(null);
            const url = URL.createObjectURL(file);
            const img = await loadImage(url);
            const newState = { file, url, element: img, width: img.width, height: img.height };

            if (type === 'reference') setReference(newState);
            else setTarget(newState);
        }
    };

    const executeColorTransfer = async () => {
        if (!reference.element || !target.element) return;

        setProcessStatus({ isProcessing: true, message: 'Parsing colors...', progress: 10 });

        try {
            // 1. Analyze Reference (Resize for speed)
            const refResized = resizeImageCanvas(reference.element, RESIZE_LONG_EDGE);
            const refStats = computeStats(refResized.ctx, refResized.width, refResized.height);
            setProcessStatus({ isProcessing: true, message: 'Analyzing target...', progress: 40 });

            await new Promise(r => setTimeout(r, 50)); // Yield UI

            // 2. Analyze Target (using Original or Resized? The request says calculate stats on resized)
            const tgtResized = resizeImageCanvas(target.element, RESIZE_LONG_EDGE);
            const tgtStats = computeStats(tgtResized.ctx, tgtResized.width, tgtResized.height);
            setProcessStatus({ isProcessing: true, message: 'Applying tone...', progress: 70 });

            await new Promise(r => setTimeout(r, 50)); // Yield UI

            // 3. Apply transfer to Resized Target for Preview
            // Re-draw clean target needed because we read from it
            const previewCanvas = document.createElement('canvas');
            previewCanvas.width = tgtResized.width;
            previewCanvas.height = tgtResized.height;
            const ctx = previewCanvas.getContext('2d')!;
            ctx.drawImage(tgtResized.canvas, 0, 0);

            const imgData = ctx.getImageData(0, 0, previewCanvas.width, previewCanvas.height);
            const data = imgData.data;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                const [l, a, bb] = rgb2lab(r, g, b);

                // Reinhard Transfer: Luminance + Global Saturation (Strict Hue Preservation)
                // 1. Luminance: Full transfer + BRIGHTNESS BOOST
                const scaleL = (tgtStats.std[0] !== 0) ? Math.min(3.0, Math.max(0.3, refStats.std[0] / tgtStats.std[0])) : 1;
                const L_BOOST = 0.03; // ~7% brightness boost
                const l_new = (l - tgtStats.mean[0]) * scaleL + refStats.mean[0] + L_BOOST;

                // 2. Chroma (a, b): Uniform Saturation Scaling
                //    Strictly clamped to avoid blowing up noise (pink/green artifacts)

                const refSatLvl = (refStats.std[1] + refStats.std[2]) / 2;
                const tgtSatLvl = (tgtStats.std[1] + tgtStats.std[2]) / 2;

                let globalSatScale = (tgtSatLvl !== 0) ? refSatLvl / tgtSatLvl : 1;
                // Conservative limit: Max 1.25x saturation boost to prevent artifacting
                globalSatScale = Math.min(1.25, Math.max(0.3, globalSatScale));

                // Use Target Mean (No Tint Shift) + Uniform Scale (No Hue Shift)
                const a_new = (a - tgtStats.mean[1]) * globalSatScale + tgtStats.mean[1];
                const b_new = (bb - tgtStats.mean[2]) * globalSatScale + tgtStats.mean[2];

                const [r_new, g_new, b_composed] = lab2rgb(l_new, a_new, b_new);

                data[i] = r_new;
                data[i + 1] = g_new;
                data[i + 2] = b_composed;
            }

            ctx.putImageData(imgData, 0, 0);
            const previewUrl = previewCanvas.toDataURL('image/jpeg', 0.9);
            setResultUrl(previewUrl);
            setProcessStatus({ isProcessing: false, message: 'Done!', progress: 100 });

        } catch (e) {
            console.error(e);
            setErrorMessage("Error during processing.");
            setProcessStatus({ isProcessing: false, message: '', progress: 0 });
        }
    };

    const handleDownload = async () => {
        if (!resultUrl || !target.element || !reference.element) return;

        // For download, we apply to FULL size
        setProcessStatus({ isProcessing: true, message: 'Rendering full size...', progress: 50 });

        // Defer to next tick to let UI update
        setTimeout(async () => {
            try {
                // Recalculate stats on resized (already have them effectively, but re-calc is cheap enough or we could store them)
                // Let's just re-do the flow cleanly for Full HD render
                // Actually, we should reuse stats from resized images for speed, and apply to full image.

                const refResized = resizeImageCanvas(reference.element!, RESIZE_LONG_EDGE);
                const refStats = computeStats(refResized.ctx, refResized.width, refResized.height);

                const tgtResized = resizeImageCanvas(target.element!, RESIZE_LONG_EDGE);
                const tgtStats = computeStats(tgtResized.ctx, tgtResized.width, tgtResized.height);

                // Output Resolution: 3000px Long Edge
                const OUTPUT_EDGE = 3000;
                const canvas = document.createElement('canvas');
                let outW = target.element!.width;
                let outH = target.element!.height;

                if (outW > outH) {
                    outH = Math.round(outH * (OUTPUT_EDGE / outW));
                    outW = OUTPUT_EDGE;
                } else {
                    outW = Math.round(outW * (OUTPUT_EDGE / outH));
                    outH = OUTPUT_EDGE;
                }

                canvas.width = outW;
                canvas.height = outH;
                const ctx = canvas.getContext('2d')!;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(target.element!, 0, 0, outW, outH);

                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imgData.data;

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];

                    const [l, aVal, bVal] = rgb2lab(r, g, b);

                    // Reinhard Transfer: Luminance + Global Saturation
                    // 1. Luminance + Brightness Boost
                    const scaleL = (tgtStats.std[0] !== 0) ? Math.min(3.0, Math.max(0.3, refStats.std[0] / tgtStats.std[0])) : 1;
                    const L_BOOST = 0.03;
                    const l_new = (l - tgtStats.mean[0]) * scaleL + refStats.mean[0] + L_BOOST;

                    // 2. Chroma: Uniform Saturation Scaling
                    const refSatLvl = (refStats.std[1] + refStats.std[2]) / 2;
                    const tgtSatLvl = (tgtStats.std[1] + tgtStats.std[2]) / 2;

                    let globalSatScale = (tgtSatLvl !== 0) ? refSatLvl / tgtSatLvl : 1;
                    globalSatScale = Math.min(1.25, Math.max(0.3, globalSatScale));

                    // Use Target Mean + Uniform Scale
                    const a_new = (aVal - tgtStats.mean[1]) * globalSatScale + tgtStats.mean[1];
                    const b_new = (bVal - tgtStats.mean[2]) * globalSatScale + tgtStats.mean[2];

                    const [r_new, g_new, b_new_val_converted] = lab2rgb(l_new, a_new, b_new);

                    data[i] = r_new;
                    data[i + 1] = g_new;
                    data[i + 2] = b_new_val_converted;
                }

                ctx.putImageData(imgData, 0, 0);

                // Trigger download
                const link = document.createElement('a');
                link.download = (target.file?.name.replace(/\.[^/.]+$/, "") || "image") + "_adjusted.jpg";
                link.href = canvas.toDataURL('image/jpeg', 0.95);
                link.click();

                setProcessStatus({ isProcessing: false, message: 'Downloaded!', progress: 100 });
            } catch (e) {
                console.error(e);
                setErrorMessage("Download failed.");
                setProcessStatus({ isProcessing: false, message: '', progress: 0 });
            }
        }, 100);
    };

    // --- Render ---

    return (
        <div className="w-full md:w-[90%] lg:w-[85%] max-w-[1800px] mx-auto py-8 space-y-8">
            {/* Header */}
            <div className="text-center space-y-2">
                <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                    Color Copy-Paste
                </h1>
                <p className="text-gray-400">Transfer the color grade from one photo to another instantly.</p>
            </div>

            {/* Main Drop Zones */}
            <div className="grid md:grid-cols-2 gap-6 relative">
                {/* Reference */}
                <div
                    className="bg-[#1e1e24] rounded-2xl p-6 border border-gray-800 flex flex-col gap-4 relative overflow-hidden group hover:border-indigo-500/50 transition-colors"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleFileSelect(e, 'reference')}
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-50" />
                    <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs border border-indigo-500/30">1</span>
                        Reference Image
                    </h2>

                    <div className={`
             aspect-video rounded-xl bg-[#151518] border-2 border-dashed border-gray-700 
             flex items-center justify-center cursor-pointer hover:bg-gray-800/50 transition-all relative overflow-hidden
             ${reference.url ? 'border-none' : ''}
          `}>
                        <input type="file" accept="image/*" onChange={(e) => handleFileSelect(e, 'reference')} className="absolute inset-0 opacity-0 cursor-pointer z-20" />

                        {reference.url ? (
                            <img src={reference.url} alt="Reference" className="w-full h-full object-contain z-10" />
                        ) : (
                            <div className="text-center text-gray-500 pointer-events-none">
                                <p className="mb-2 text-3xl">🏞️</p>
                                <p className="text-sm font-medium">Drop reference here</p>
                                <p className="text-xs opacity-60">or click to upload</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Target */}
                <div
                    className="bg-[#1e1e24] rounded-2xl p-6 border border-gray-800 flex flex-col gap-4 relative overflow-hidden group hover:border-purple-500/50 transition-colors"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleFileSelect(e, 'target')}
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500 opacity-50" />
                    <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs border border-purple-500/30">2</span>
                        Target Image
                    </h2>

                    <div className={`
             aspect-video rounded-xl bg-[#151518] border-2 border-dashed border-gray-700 
             flex items-center justify-center cursor-pointer hover:bg-gray-800/50 transition-all relative overflow-hidden
              ${target.url ? 'border-none' : ''}
          `}>
                        <input type="file" accept="image/*" onChange={(e) => handleFileSelect(e, 'target')} className="absolute inset-0 opacity-0 cursor-pointer z-20" />

                        {target.url ? (
                            <img src={target.url} alt="Target" className="w-full h-full object-contain z-10" />
                        ) : (
                            <div className="text-center text-gray-500 pointer-events-none">
                                <p className="mb-2 text-3xl">📷</p>
                                <p className="text-sm font-medium">Drop target here</p>
                                <p className="text-xs opacity-60">or click to upload</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Action Area */}
            <div className="flex flex-col items-center justify-center gap-6 py-4">
                {errorMessage && (
                    <div className="bg-red-500/10 text-red-400 px-4 py-2 rounded-lg border border-red-500/20 text-sm">
                        {errorMessage}
                    </div>
                )}

                <button
                    onClick={executeColorTransfer}
                    disabled={!reference.url || !target.url || processStatus.isProcessing}
                    className={`
             group relative px-8 py-4 rounded-full font-bold text-white shadow-lg shadow-indigo-500/20
             bg-gradient-to-r from-indigo-600 to-purple-600
             hover:scale-105 hover:shadow-indigo-500/40 active:scale-95 transition-all duration-300
             disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none
           `}
                >
                    <span className="flex items-center gap-2">
                        Match Colors ✨
                    </span>
                </button>

                {/* Progress */}
                {(processStatus.isProcessing || processStatus.progress > 0) && (
                    <div className="w-full max-w-md space-y-2">
                        <div className="flex justify-between text-xs font-mono text-gray-400">
                            <span>{processStatus.message}</span>
                            <span>{processStatus.progress}%</span>
                        </div>
                        <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
                                style={{ width: `${processStatus.progress}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Result Area */}
            {resultUrl && (
                <div className="animate-slide-up space-y-6 pt-8 border-t border-gray-800">
                    <h3 className="text-2xl font-bold text-center text-gray-200">Processing Result</h3>

                    <div className="relative rounded-2xl overflow-hidden glass shadow-2xl w-full mx-auto border border-white/10">
                        <div className="grid grid-cols-2 bg-black/50">
                            <div className="relative group border-r border-white/10">
                                <div className="absolute top-4 left-4 bg-black/50 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-white/80 z-10">Original</div>
                                <img src={target.url!} className="w-full h-auto object-contain" alt="Original" />
                            </div>
                            <div className="relative group">
                                <div className="absolute top-4 left-4 bg-indigo-600/50 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-white z-10">New Look</div>
                                <img src={resultUrl} className="w-full h-auto object-contain" alt="Result" />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-center pt-4">
                        <button
                            onClick={handleDownload}
                            disabled={processStatus.isProcessing}
                            className="px-8 py-3 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition-transform active:scale-95 flex items-center gap-2 shadow-xl shadow-white/5"
                        >
                            Download Full Size ⬇️
                        </button>
                    </div>
                </div>
            )}

            {/* Hidden helper for full size processing if needed, though we used offscreen canvas */}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}
