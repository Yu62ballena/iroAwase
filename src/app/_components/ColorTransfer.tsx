'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type, @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unused-vars, react-hooks/set-state-in-effect */

import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';

// --- Types ---

interface ImageState {
	file: File;
	url: string;
	element: HTMLImageElement;
	width: number;
	height: number;
}

interface ResultState {
	name: string;
	originalUrl: string;
	resultUrl: string;
	intensity: number; // 0-100, default 50
	shadow: number; // 0-100, default 50 (Shadow Crush Strength)
	id: number;
}

interface ProcessStatus {
	isProcessing: boolean;
	message: string;
	progress: number;
}

// --- Constants & Translations ---

const RESIZE_LONG_EDGE = 3000;
const PREVIEW_EDGE = 1000;
const MAX_TARGET_FILES = 10;
const MAX_FILE_SIZE_MB = 15;

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
const DISPLAY_ACCEPTED_FORMATS = "JPG, PNG, WEBP, HEIC";

// Translations
type Language = 'ja' | 'en';

const TRANSLATIONS = {
	ja: {
		subtitle: "写真の色調を、別の写真へ瞬時にコピー",
		refTitle: "① お手本画像",
		targetTitle: "② 補正する画像",
		targetCount: "枚選択中",
		changeRef: "変更する",
		dropRef: "ここにドロップ\nまたはクリックしてアップロード",
		dropRefSub: "クリックしてアップロード",
		dropTarget: `最大${MAX_TARGET_FILES}枚までドロップ可能\nまたはクリックしてアップロード`,
		dropTargetSub: "クリックしてアップロード",
		btnAdjust: "色調を適用", // Concise Japanese
		btnProcessing: "処理中...",
		btnDownloadZip: "まとめてダウンロード (.zip) 📦",
		btnReset: "リセットして最初に戻る ↺",
		resultsTitle: "変換結果",
		galleryTitle: "一覧プレビュー",
		sliderIntensity: "補正の強さ",
		sliderSaturation: "彩度",
		sliderShadow: "シャドウ",
		labelOriginal: "元画像",
		labelStandard: "標準",
		labelIntense: "強め",
		msgInvalidExt: "対応していないファイル形式です: ",
		msgTooLarge: "ファイルサイズが大きすぎます（最大15MB）",
		msgHeicFail: "HEICの変換に失敗しました",
		msgLoadFail: "画像の読み込みに失敗しました",
		msgNoValid: "有効な画像が選択されていません",
		msgZipFail: "ZIP作成に失敗しました",
		statusAnalyzing: "参照画像を解析中...",
		statusProcessing: "画像処理中...",
		statusDone: "完了!",
		statusGenZip: "高解像度画像を生成中...",
		statusCreatingZip: "ZIPファイルを作成中...",
		before: "変更前",
		after: "変更後",
		add: "+ 追加",
		menu_app_desc: "写真の色調を、別の写真へ瞬時にコピーするAIカラーグレーディングツール。",
		menu_related: "関連ツール",
		menu_karukusuru_desc: "画質そのまま、ファイルだけ軽くするツール。",
		menu_open: "開く",
		menu_about: "iroAwase について",
		menu_privacy: "・写真はあなたのスマホ・PCの中だけで処理されます",
		menu_client_side: "・すべての処理はブラウザ上で完結します",
		privacyNotice: "🔒 写真はあなたのスマホ・PCの中だけで処理されます",
		modal_reset_title: "全てリセットしますか？",
		modal_reset_desc: "アップロードした画像と設定がすべて消去されます。この操作は取り消せません。",
		modal_cancel: "キャンセル",
		modal_confirm: "リセットする"
	},
	en: {
		subtitle: "Transfer the color grade to multiple photos instantly.",
		refTitle: "① Reference Image",
		targetTitle: "② Target Images",
		targetCount: "selected",
		changeRef: "Change Reference",
		dropRef: "Drop reference here\nor click to upload",
		dropRefSub: "or click to upload",
		dropTarget: `Drop up to ${MAX_TARGET_FILES} images\nor click to upload`,
		dropTargetSub: "or click to upload",
		btnAdjust: "Adjust Colors",
		btnProcessing: "Processing...",
		btnDownloadZip: "Download All as ZIP (.zip) 📦",
		btnReset: "Reset All ↺",
		resultsTitle: "Processing Results",
		galleryTitle: "Gallery Preview",
		sliderIntensity: "Adjustment Intensity",
		sliderSaturation: "Saturation",
		sliderShadow: "Shadow",
		labelOriginal: "Original",
		labelStandard: "Standard",
		labelIntense: "Intense",
		msgInvalidExt: "Unsupported format: ",
		msgTooLarge: "File too large (Max 15MB)",
		msgHeicFail: "HEIC conversion failed",
		msgLoadFail: "Failed to load image",
		msgNoValid: "No valid images selected",
		msgZipFail: "ZIP creation failed",
		statusAnalyzing: "Analyzing reference...",
		statusProcessing: "Processing image...",
		statusDone: "Done!",
		statusGenZip: "Generating high-res images...",
		statusCreatingZip: "Creating ZIP...",
		before: "Before",
		after: "After",
		add: "+ Add",
		menu_app_desc: "AI color grading tool that instantly transfers color tones between photos.",
		menu_related: "Related Tools",
		menu_karukusuru_desc: "Reduce file size while keeping quality high.",
		menu_open: "Open",
		menu_about: "About iroAwase",
		menu_privacy: "• Photos are processed only inside your phone or PC",
		menu_client_side: "• All processing is done on your browser",
		privacyNotice: "🔒 Photos are processed only inside your phone or PC",
		modal_reset_title: "Reset Everything?",
		modal_reset_desc: "This will clear all uploaded images and settings. This action cannot be undone.",
		modal_cancel: "Cancel",
		modal_confirm: "Reset All"
	}
};


// --- Helper Functions ---

const mapDisplayToInternal = (x: number): number => {
	if (x <= 50) {
		return x * 0.7; // 0->0, 50->35
	} else {
		return 35 + (x - 50) * 1.3; // 50->35, 100->100
	}
};

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
	// @ts-ignore
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(img, 0, 0, width, height);
	return { canvas, ctx, width, height };
};

// --- Math & Color Logic ---

const TABLE_sRGBToLinear = new Float32Array(256);
const TABLE_linearToSRGB = new Uint8Array(4096);

for (let i = 0; i < 256; i++) {
	const x = i / 255;
	TABLE_sRGBToLinear[i] = x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

const sRGBToLinear = (x: number): number => {
	return TABLE_sRGBToLinear[x];
};

const linearToSRGB = (x: number): number => {
	const val = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
	return Math.round(Math.min(255, Math.max(0, val * 255)));
};

// Oklab Matrices (D65)
// Referenced from https://bottosson.github.io/posts/oklab/

const rgb2oklab = (r: number, g: number, b: number): [number, number, number] => {
	// 1. Linear RGB
	const rL = TABLE_sRGBToLinear[r];
	const gL = TABLE_sRGBToLinear[g];
	const bL = TABLE_sRGBToLinear[b];

	// 2. Linear RGB -> LMS (Oklab specific matrix)
	const l_ = 0.4122214708 * rL + 0.5363325363 * gL + 0.0514459929 * bL;
	const m_ = 0.2119034982 * rL + 0.6806995451 * gL + 0.1073969566 * bL;
	const s_ = 0.0883024619 * rL + 0.2817188376 * gL + 0.6299787005 * bL;

	// 3. Non-linear transform (cube root approximation)
	const l__ = Math.cbrt(l_);
	const m__ = Math.cbrt(m_);
	const s__ = Math.cbrt(s_);

	// 4. LMS -> Oklab
	const L = 0.2104542553 * l__ + 0.7936177850 * m__ - 0.0040720468 * s__;
	const a = 1.9779984951 * l__ - 2.4285922050 * m__ + 0.4505937099 * s__;
	const b_val = 0.0259040371 * l__ + 0.7827717662 * m__ - 0.8086757660 * s__;

	return [L, a, b_val];
};

const oklab2rgb = (L: number, a: number, b: number): [number, number, number] => {
	// 1. Oklab -> LMS
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

	// 2. LMS non-linear inverse (cube)
	const l__ = l_ * l_ * l_;
	const m__ = m_ * m_ * m_;
	const s__ = s_ * s_ * s_;

	// 3. LMS -> Linear RGB
	const rL = 4.0767416621 * l__ - 3.3077115913 * m__ + 0.2309699292 * s__;
	const gL = -1.2684380046 * l__ + 2.6097574011 * m__ - 0.3413193965 * s__;
	const bL = -0.0041960863 * l__ - 0.7034186147 * m__ + 1.7076147010 * s__;

	return [linearToSRGB(rL), linearToSRGB(gL), linearToSRGB(bL)];
};

// Functions alias for compatibility with existing code
const rgb2lab = rgb2oklab;
const lab2rgb = oklab2rgb;

interface ColorStats {
	mean: [number, number, number];
	std: [number, number, number];
	percentiles?: {
		lMax95: number;
		cMax95: number;
		lMin5: number;
	};
}

interface DebugInfo {
	refLMean: number;
	refLStd: number;
	refCMean: number;
	refAMean: number;
	refBMean: number;
	tgtLMean: number;
	tgtLStd: number;
	tgtCMean: number;
	tgtAMean: number;
	tgtBMean: number;
	outLMean: number;
	outCMean: number;
	outAMean: number;
	outBMean: number;
	clampedLPercent: number;
	clampedCPercent: number;
	distance: number;
	distanceFactor: number;
	scaleA_std?: number;
	scaleB_std?: number;
	toneCurveL?: { x: number[]; y: number[]; slopes: number[]; cap: number };
	toneCurveC?: { x: number[]; y: number[]; slopes: number[]; cap: number };
}

interface ResultState {
	name: string;
	originalUrl: string;
	resultUrl: string;
	intensity: number; // 0-100, default 35
	shadow: number; // 0-100, default 50 (Shadow Crush Strength)
	saturation: number; // -50 to 50, default 0
	id: number;
	debugInfo?: DebugInfo;
}

// シャドウ引き締めの独立関数（将来的な1本化に備える）
function applyShadowCrush(l: number, shadowStrength: number): number {
	if (l >= 0.65) return l; // シャドウ領域（L<0.65）以外は影響なし
	if (shadowStrength === 50) return l;

	if (shadowStrength > 50) {
		// 引き締め方向 (51〜100 -> 0.0〜1.0)
		const strength = (shadowStrength - 50) / 50.0;
		// 最大引き締めでcrushMinFactorが0.0に近づく
		const crushMinFactor = 1.0 - strength;
		const crush = crushMinFactor + (l / 0.65) * (1.0 - crushMinFactor);
		return l * crush;
	} else {
		// 持ち上げ方向 (0〜49)
		// strength: 0(持ち上げ最大) -> 49(微小) = 1.0(最大) -> 0.02
		const strength = (50 - shadowStrength) / 50.0;
		// 0.0〜1.0に正規化
		const normalized = l / 0.65;
		// ガンマ補正的に持ち上げる。strength=1.0のときガンマ0.5（ルート）
		const lifted = Math.pow(normalized, 1.0 - strength * 0.5);
		return lifted * 0.65;
	}
}

// 彩度調整ロジックの独立関数（将来的な1本化に備える）
function applySaturationAdjustment(a: number, b: number, saturationValue: number): [number, number] {
	if (saturationValue === 0) return [a, b];
	// saturationValue: -50 to 50
	// 0 -> 1.0x, 50 -> 1.5x, -50 -> 0.5x
	const scale = 1.0 + (saturationValue / 100.0);
	return [a * scale, b * scale];
}

const computeStats = (ctx: CanvasRenderingContext2D, width: number, height: number): ColorStats => {
	const imgData = ctx.getImageData(0, 0, width, height);
	const data = imgData.data;
	const pixels: { l: number, a: number, b: number, c: number }[] = [];

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const [l, a, bb] = rgb2lab(r, g, b);
		const c = Math.sqrt(a * a + bb * bb);
		pixels.push({ l, a, b: bb, c });
	}

	const n = pixels.length;
	if (n === 0) return { mean: [0, 0, 0], std: [1, 1, 1], percentiles: { lMax95: 1, cMax95: 1, lMin5: 0 } };

	// Calculate percentiles
	const lSorted = [...pixels].map(p => p.l).sort((x, y) => x - y);
	const cSorted = [...pixels].map(p => p.c).sort((x, y) => x - y);

	const idxL5 = Math.floor(n * 0.05);
	const idxL95 = Math.floor(n * 0.95);
	const idxC95 = Math.floor(n * 0.985); // 上位1.5%の除外に緩和（元0.95）

	const lMin5 = lSorted[idxL5];
	const lMax95 = lSorted[idxL95];
	const cMax95 = cSorted[idxC95];

	// Filter out extreme outliers for mean/std calculation
	// Exclude bottom 5% and top 5% of L, and top 5% of C
	const filtered = pixels.filter(p => p.l >= lMin5 && p.l <= lMax95 && p.c <= cMax95);

	const fn = filtered.length || 1;
	const meanL = filtered.reduce((acc, p) => acc + p.l, 0) / fn;
	const meanA = filtered.reduce((acc, p) => acc + p.a, 0) / fn;
	const meanB = filtered.reduce((acc, p) => acc + p.b, 0) / fn;

	const varL = filtered.reduce((acc, p) => acc + Math.pow(p.l - meanL, 2), 0) / fn;
	const varA = filtered.reduce((acc, p) => acc + Math.pow(p.a - meanA, 2), 0) / fn;
	const varB = filtered.reduce((acc, p) => acc + Math.pow(p.b - meanB, 2), 0) / fn;

	const stdL = Math.sqrt(varL);
	const stdA = Math.sqrt(varA);
	const stdB = Math.sqrt(varB);

	return {
		mean: [meanL, meanA, meanB],
		std: [stdL, stdA, stdB],
		percentiles: { lMax95, cMax95, lMin5 }
	};
};

// --- v2 Algorithm Types & Constants ---
// v2: パーセンタイル・アンカー方式の単調トーンカーブ
// L(明度)とC(彩度)それぞれについて、target/referenceのパーセンタイル対応点を
// アンカーとした写像を作り、傾き制限つきの単調カーブとしてLUTに焼き込む。
// 帯域分割と違い、写像の連続性・単調性・傾き上限が構成方法として保証される。

const ANCHOR_PERCENTILES = [0.02, 0.10, 0.25, 0.50, 0.75, 0.90, 0.98];

// 傾き制限: 上限はノイズ増幅の上限、下限は階調潰れの下限。
// 上限はIntensityスライダーに連動: 通常域(〜60)ではタイトに保ちノイズを抑え、
// 極端な位置(60〜100)でのみ緩めて強い転写を許容する。
const L_SLOPE_MIN = 0.35;
const L_SLOPE_MAX_NORMAL = 1.8;
const L_SLOPE_MAX_EXTREME = 3.0;
const C_SLOPE_MIN = 0.8; // 彩度縮小の下限。彩度が縮みすぎる画像で計算結果を自然に持ち上げる(旧SCALE_FLOOR相当、0.7→0.8に緩和)
const C_SLOPE_MAX_NORMAL = 1.6;
const C_SLOPE_MAX_EXTREME = 3.0;
const SLOPE_RELAX_START = 60; // このIntensityから上限を緩め始める

// Intensityに応じた傾き上限を返す
function slopeMaxForIntensity(intensity: number, normalMax: number, extremeMax: number): number {
	const t = Math.min(1, Math.max(0, (intensity - SLOPE_RELAX_START) / (100 - SLOPE_RELAX_START)));
	return normalMax + (extremeMax - normalMax) * t;
}

const TONE_LUT_SIZE = 512;
const L_DOMAIN_MAX = 1.0; // OklabのLは0〜1
const C_DOMAIN_MAX = 0.5; // OklabのCは実用上0.4未満
const ANCHOR_MIN_DX = 1e-4; // これより近いアンカーは統合(縮退防止)

interface BandStat {
	mean: number;
	std: number;
}

interface ColorStatsV2 {
	lAnchors: number[]; // ANCHOR_PERCENTILES位置のLの値
	cAnchors: number[]; // ANCHOR_PERCENTILES位置のCの値
	globalL: BandStat;
	globalC: BandStat;
	globalA: BandStat;
	globalB: BandStat;
	percentiles?: {
		lMax95: number;
		cMax95: number;
		lMin5: number;
	};
}

interface ToneCurve {
	lut: Float32Array;
	domainMax: number;
	// デバッグ用: 傾き制限適用後のアンカーと区間傾き
	anchorsX: number[];
	anchorsY: number[];
	slopes: number[];
}

// target→referenceのパーセンタイル対応から、単調・傾き制限つきトーンカーブを構築する。
// strength: 0で恒等写像、1で完全マッチ。
function buildToneCurve(
	tgtAnchors: number[],
	refAnchors: number[],
	strength: number,
	slopeMin: number,
	slopeMax: number,
	domainMax: number
): ToneCurve {
	// 1. アンカーを強度でブレンド + 近すぎるxを統合
	const xs: number[] = [];
	const ys: number[] = [];
	for (let i = 0; i < tgtAnchors.length; i++) {
		const x = tgtAnchors[i];
		const y = x + (refAnchors[i] - x) * strength;
		if (xs.length > 0 && x - xs[xs.length - 1] < ANCHOR_MIN_DX) {
			ys[ys.length - 1] = (ys[ys.length - 1] + y) / 2;
		} else {
			xs.push(x);
			ys.push(y);
		}
	}

	// 2. yの単調化(パーセンタイル由来なら理論上単調だが数値誤差対策)
	for (let i = 1; i < ys.length; i++) {
		if (ys[i] < ys[i - 1]) ys[i] = ys[i - 1];
	}

	// 3. 中央アンカー(≒中央値の対応)を固定し、外側へ向かって傾きをクランプ。
	//    これで写像全体の傾きが[slopeMin, slopeMax]に収まることが保証される。
	const clampSlope = (s: number) => Math.min(slopeMax, Math.max(slopeMin, s));
	const mid = Math.floor(xs.length / 2);
	for (let i = mid; i < xs.length - 1; i++) {
		const dx = xs[i + 1] - xs[i];
		ys[i + 1] = ys[i] + clampSlope((ys[i + 1] - ys[i]) / dx) * dx;
	}
	for (let i = mid; i > 0; i--) {
		const dx = xs[i] - xs[i - 1];
		ys[i - 1] = ys[i] - clampSlope((ys[i] - ys[i - 1]) / dx) * dx;
	}

	const slopes: number[] = [];
	for (let i = 0; i < xs.length - 1; i++) {
		slopes.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
	}

	// 4. 区分線形でLUTに焼き込む。端の外側は端区間の傾きで外挿。
	const lut = new Float32Array(TONE_LUT_SIZE);
	const n = xs.length;
	const sFirst = n >= 2 ? slopes[0] : 1.0;
	const sLast = n >= 2 ? slopes[n - 2] : 1.0;
	let seg = 0;
	for (let i = 0; i < TONE_LUT_SIZE; i++) {
		const v = (i / (TONE_LUT_SIZE - 1)) * domainMax;
		let y: number;
		if (n < 2) {
			y = n === 1 ? ys[0] + (v - xs[0]) : v;
		} else if (v <= xs[0]) {
			y = ys[0] + (v - xs[0]) * sFirst;
		} else if (v >= xs[n - 1]) {
			y = ys[n - 1] + (v - xs[n - 1]) * sLast;
		} else {
			while (seg < n - 2 && v > xs[seg + 1]) seg++;
			const t = (v - xs[seg]) / (xs[seg + 1] - xs[seg]);
			y = ys[seg] + (ys[seg + 1] - ys[seg]) * t;
		}
		lut[i] = Math.max(0, y);
	}

	// 5. 軽い移動平均でアンカーの折れ目を丸める(単調性は保たれる)
	const RADIUS = 3;
	for (let pass = 0; pass < 2; pass++) {
		const src = Float32Array.from(lut);
		for (let i = 0; i < TONE_LUT_SIZE; i++) {
			let sum = 0;
			for (let j = -RADIUS; j <= RADIUS; j++) {
				sum += src[Math.min(TONE_LUT_SIZE - 1, Math.max(0, i + j))];
			}
			lut[i] = sum / (2 * RADIUS + 1);
		}
	}

	return { lut, domainMax, anchorsX: xs, anchorsY: ys, slopes };
}

function sampleToneCurve(curve: ToneCurve, v: number): number {
	const t = (v / curve.domainMax) * (TONE_LUT_SIZE - 1);
	if (t <= 0) return curve.lut[0];
	if (t >= TONE_LUT_SIZE - 1) return curve.lut[TONE_LUT_SIZE - 1];
	const i = Math.floor(t);
	const f = t - i;
	return curve.lut[i] * (1 - f) + curve.lut[i + 1] * f;
}

const computeStatsV2 = (ctx: CanvasRenderingContext2D, width: number, height: number): ColorStatsV2 => {
	const imgData = ctx.getImageData(0, 0, width, height);
	const data = imgData.data;
	const n = data.length / 4;

	if (n === 0) {
		const defaultBand = { mean: 0, std: 1 };
		return {
			lAnchors: ANCHOR_PERCENTILES.map(p => p),
			cAnchors: ANCHOR_PERCENTILES.map(() => 0),
			globalL: { ...defaultBand }, globalC: { ...defaultBand },
			globalA: { ...defaultBand }, globalB: { ...defaultBand },
			percentiles: { lMax95: 1, cMax95: 1, lMin5: 0 }
		};
	}

	const lArr = new Float32Array(n);
	const aArr = new Float32Array(n);
	const bArr = new Float32Array(n);
	const cArr = new Float32Array(n);

	for (let i = 0, p = 0; i < data.length; i += 4, p++) {
		const [l, a, bb] = rgb2lab(data[i], data[i + 1], data[i + 2]);
		lArr[p] = l;
		aArr[p] = a;
		bArr[p] = bb;
		cArr[p] = Math.sqrt(a * a + bb * bb);
	}

	// TypedArrayのsortは数値順
	const lSorted = Float32Array.from(lArr).sort();
	const cSorted = Float32Array.from(cArr).sort();
	const pct = (sorted: Float32Array, p: number) => sorted[Math.min(n - 1, Math.floor(n * p))];

	// トーンカーブ用アンカー
	const lAnchors = ANCHOR_PERCENTILES.map(p => pct(lSorted, p));
	const cAnchors = ANCHOR_PERCENTILES.map(p => pct(cSorted, p));

	// クランプ用パーセンタイル (既存の互換性)
	const lMin5 = pct(lSorted, 0.05);
	const lMax95 = pct(lSorted, 0.95);
	const cMax95 = pct(cSorted, 0.985);

	// グローバルのL, C, a, b (外れ値除外つき、従来と同じフィルタ)
	let gn = 0, sumL = 0, sumC = 0, sumA = 0, sumB = 0;
	for (let p = 0; p < n; p++) {
		if (lArr[p] >= lMin5 && lArr[p] <= lMax95 && cArr[p] <= cMax95) {
			gn++;
			sumL += lArr[p]; sumC += cArr[p]; sumA += aArr[p]; sumB += bArr[p];
		}
	}
	const g = gn || 1;
	const globalMeanL = sumL / g, globalMeanC = sumC / g, globalMeanA = sumA / g, globalMeanB = sumB / g;

	let varL = 0, varC = 0, varA = 0, varB = 0;
	for (let p = 0; p < n; p++) {
		if (lArr[p] >= lMin5 && lArr[p] <= lMax95 && cArr[p] <= cMax95) {
			varL += (lArr[p] - globalMeanL) ** 2;
			varC += (cArr[p] - globalMeanC) ** 2;
			varA += (aArr[p] - globalMeanA) ** 2;
			varB += (bArr[p] - globalMeanB) ** 2;
		}
	}

	return {
		lAnchors,
		cAnchors,
		globalL: { mean: globalMeanL, std: Math.sqrt(varL / g) },
		globalC: { mean: globalMeanC, std: Math.sqrt(varC / g) },
		globalA: { mean: globalMeanA, std: Math.sqrt(varA / g) },
		globalB: { mean: globalMeanB, std: Math.sqrt(varB / g) },
		percentiles: { lMax95, cMax95, lMin5 }
	};
};

// --- Component ---

export default function ColorTransfer() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isResetModalOpen, setIsResetModalOpen] = useState(false);
	const [language, setLanguage] = useState<Language>('ja');
	const [reference, setReference] = useState<ImageState | null>(null);
	const [targets, setTargets] = useState<ImageState[]>([]);
	const [results, setResults] = useState<ResultState[]>([]);
	const [processStatus, setProcessStatus] = useState<ProcessStatus>({ isProcessing: false, message: '', progress: 0 });
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const [isDebugMode, setIsDebugMode] = useState(false);
	const [showDebugPanel, setShowDebugPanel] = useState(false);
	const [algorithmVersion, setAlgorithmVersion] = useState<'v1' | 'v2'>('v2');

	// Get translation object helper
	const t = TRANSLATIONS[language];

	// Auto-scroll ref
	const resultsRef = useRef<HTMLDivElement>(null);

	// ギャラリーから個別カードへのスクロール用
	const cardRefs = useRef<{ [id: number]: HTMLDivElement | null }>({});
	const scrollToResultCard = (id: number) => {
		cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const [activeCardId, setActiveCardId] = useState<number | null>(null);
	const [isMobileGalleryOpen, setIsMobileGalleryOpen] = useState(false);
	const sidebarListRef = useRef<HTMLDivElement>(null);
	const mobileListRef = useRef<HTMLDivElement>(null);

	// Setup IntersectionObserver for auto-scroll tracking
	useEffect(() => {
		if (results.length === 0) return;

		const observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					const idStr = (entry.target as HTMLElement).dataset.cardId;
					if (idStr) {
						const id = Number(idStr);
						if (!isNaN(id)) {
							setActiveCardId(id);
						}
					}
				}
			});
		}, {
			root: null,
			rootMargin: '-30% 0px -60% 0px',
			threshold: 0
		});

		Object.values(cardRefs.current).forEach(el => {
			if (el) observer.observe(el);
		});

		return () => observer.disconnect();
	}, [results.length]);

	// Auto scroll sidebar / mobile gallery when active card changes
	useEffect(() => {
		if (activeCardId === null) return;
		
		const sideBtn = sidebarListRef.current?.querySelector(`[data-thumb-id="${activeCardId}"]`);
		if (sideBtn) {
			sideBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}

		const mobBtn = mobileListRef.current?.querySelector(`[data-thumb-id="${activeCardId}"]`);
		if (mobBtn) {
			mobBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
		}
	}, [activeCardId]);

	const imageCache = useRef<{
		[id: number]: {
			ctx: CanvasRenderingContext2D, // Original preview context (resized)
			width: number,
			height: number,
			tgtStats: ColorStats | ColorStatsV2,
			refStats: ColorStats | ColorStatsV2,
			algorithmVersion: 'v1' | 'v2'
		}
	}>({});

	// Throttled update for slider
	const processingRef = useRef<{ [id: number]: boolean }>({});
	const workerRef = useRef<{ [id: number]: NodeJS.Timeout }>({});

	// Detect user language and debug query on mount
	useEffect(() => {
		const lang = navigator.language || navigator.languages[0];
		if (lang && !lang.toLowerCase().startsWith('ja')) {
			setLanguage('en');
		} else {
			setLanguage('ja');
		}

		if (typeof window !== 'undefined') {
			const searchParams = new URLSearchParams(window.location.search);
			const hashPart = window.location.hash.split('?')[1];
			const hashParams = new URLSearchParams(hashPart || '');

			if (searchParams.get('debug') === '1' || hashParams.get('debug') === '1') {
				setIsDebugMode(true);
				setShowDebugPanel(true);
			}
		}
	}, []);

	// Reset Handler (Actual reset)
	const performReset = () => {
		setReference(null);
		setTargets([]);
		setResults([]);
		setProcessStatus({ isProcessing: false, message: '', progress: 0 });
		setErrorMessage(null);
		setImageCache({});
		setIsResetModalOpen(false);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	const handleResetClick = () => {
		if (reference || targets.length > 0) {
			setIsResetModalOpen(true);
		}
	};

	const handleRemoveTarget = (index: number) => {
		setTargets(prev => {
			const newTargets = [...prev];
			if (newTargets[index]?.url) URL.revokeObjectURL(newTargets[index].url);
			newTargets.splice(index, 1);
			return newTargets;
		});

		setResults(prev => {
			if (prev.length === 0) return prev;
			return prev.filter(r => r.id !== index).map(r => r.id > index ? { ...r, id: r.id - 1 } : r);
		});

		// imageCacheのキーをシフトする
		const newCache: { [id: number]: any } = {};
		Object.keys(imageCache.current).forEach(key => {
			const k = parseInt(key);
			if (k < index) {
				newCache[k] = imageCache.current[k];
			} else if (k > index) {
				newCache[k - 1] = imageCache.current[k];
			}
		});
		imageCache.current = newCache;
	};

	const validateAndProcessFile = async (file: File): Promise<File | Blob | null> => {
		// 1. Check Extension
		const hasValidExt = ACCEPTED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
		if (!hasValidExt) {
			console.warn("Invalid extension:", file.name);
			return null;
		}

		// 2. Check Size
		if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
			console.warn("File too large:", file.name);
			return null;
		}

		// 3. Handle HEIC/HEIF
		const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
		if (isHeic) {
			try {
				const heic2any = (await import('heic2any')).default;
				const convertedBlob = await heic2any({
					blob: file,
					toType: "image/jpeg",
					quality: 0.9
				});
				if (Array.isArray(convertedBlob)) return convertedBlob[0];
				return convertedBlob;
			} catch (err) {
				console.error("HEIC conversion failed", err);
				return null;
			}
		}

		return file;
	};

	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLElement>, type: 'reference' | 'target') => {
		e.preventDefault();
		let fileList: FileList | null = null;
		if ('dataTransfer' in e) {
			fileList = e.dataTransfer.files;
		} else if ('target' in e && e.target instanceof HTMLInputElement) {
			fileList = e.target.files;
		}

		if (!fileList || fileList.length === 0) return;

		setErrorMessage(null);
		const filesArray = Array.from(fileList);

		// Validate Types
		const unsupportedFiles = filesArray.filter(f => !ACCEPTED_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext)));
		if (unsupportedFiles.length > 0) {
			const names = unsupportedFiles.map(f => f.name).join(', ');
			setErrorMessage(`${t.msgInvalidExt}${names}`);
		}

		if (type === 'reference') {
			const originalFile = filesArray[0];

			setProcessStatus({ isProcessing: true, message: t.statusAnalyzing, progress: 0 });

			const processedFile = await validateAndProcessFile(originalFile);

			if (!processedFile) {
				if (!errorMessage) setErrorMessage(t.msgTooLarge);
				setProcessStatus({ isProcessing: false, message: '', progress: 0 });
				return;
			}

			const fileObj = processedFile instanceof File ? processedFile : new File([processedFile], originalFile.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
			const url = URL.createObjectURL(fileObj);

			try {
				const img = await loadImage(url);
				if (img.width === 0 || img.height === 0) throw new Error("Image has 0 dimensions");
				setReference({ file: fileObj, url, element: img, width: img.width, height: img.height });
			} catch (err) {
				console.error("Reference load error:", err);
				setErrorMessage(t.msgLoadFail);
				URL.revokeObjectURL(url);
			}
			setProcessStatus({ isProcessing: false, message: '', progress: 0 });

		} else {
			// Target: Multi-select
			setProcessStatus({ isProcessing: true, message: t.statusProcessing, progress: 0 });

			const newTargets: ImageState[] = [];
			const failedLoads: string[] = [];

			const candidates = filesArray.slice(0, MAX_TARGET_FILES); // process up to N

			for (const file of candidates) {
				const processedFile = await validateAndProcessFile(file);
				if (processedFile) {
					const fileObj = processedFile instanceof File ? processedFile : new File([processedFile], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
					const url = URL.createObjectURL(fileObj);
					try {
						const img = await loadImage(url);
						if (img.width === 0 || img.height === 0) throw new Error("Image has 0 dimensions");
						newTargets.push({ file: fileObj, url, element: img, width: img.width, height: img.height });
					} catch (err) {
						console.error("Failed image load", file.name, err);
						failedLoads.push(file.name);
						URL.revokeObjectURL(url);
					}
				}
			}

			if (failedLoads.length > 0) {
				const msg = `${t.msgLoadFail}: ${failedLoads.join(', ')}`;
				setErrorMessage(prev => prev ? `${prev} | ${msg}` : msg);
			}

			if (newTargets.length === 0 && filesArray.length > 0 && failedLoads.length === 0 && unsupportedFiles.length === 0) {
				if (!errorMessage) setErrorMessage(t.msgNoValid);
			} else {
				setTargets(prev => [...prev, ...newTargets].slice(0, MAX_TARGET_FILES));
			}

			setProcessStatus({ isProcessing: false, message: '', progress: 0 });
		}
	};

	// Apply color transfer with v2 algorithm (Band splitting)
	const processImageBufferV2 = (
		imgData: ImageData,
		refStats: ColorStatsV2,
		tgtStats: ColorStatsV2,
		intensity: number,
		shadowStrength: number = 50,
		saturation: number = 0,
		debugOut?: { debugInfo?: DebugInfo }
	): ImageData => {
		const data = imgData.data;
		const output = new ImageData(new Uint8ClampedArray(data), imgData.width, imgData.height);
		const outData = output.data;

		const dL = refStats.globalL.mean - tgtStats.globalL.mean;
		const da = refStats.globalA.mean - tgtStats.globalA.mean;
		const db = refStats.globalB.mean - tgtStats.globalB.mean;
		const dist = Math.sqrt(dL * dL + da * da + db * db);

		let distanceFactor = Math.min(1.0, 0.3 + (dist * 7.0));
		if (tgtStats.globalC.mean > refStats.globalC.mean) {
			distanceFactor = Math.max(distanceFactor, 0.6);
		}
		const userIntent = Math.abs(intensity - 50) / 50.0;
		distanceFactor = distanceFactor + (1.0 - distanceFactor) * userIntent;
		const k = (intensity / 114.0) * distanceFactor;

		const SCALE_CAP = 3.0;
		const SCALE_FLOOR = 0.8; // a/b色相オフセットの縮小下限(彩度が縮みすぎる画像を持ち上げる、0.7→0.8に緩和)
		const REF_STD_CAP = 0.18;
		const BLEND_STD = 0.95;
		const BLEND_MEAN_C = 0.8;

		// L(明度)・C(彩度)の単調トーンカーブをLUTに焼き込む
		// 傾き上限はIntensityに連動(通常域はタイト、極端な位置のみ緩和)
		const lSlopeMax = slopeMaxForIntensity(intensity, L_SLOPE_MAX_NORMAL, L_SLOPE_MAX_EXTREME);
		const cSlopeMax = slopeMaxForIntensity(intensity, C_SLOPE_MAX_NORMAL, C_SLOPE_MAX_EXTREME);
		const lCurve = buildToneCurve(tgtStats.lAnchors, refStats.lAnchors, k, L_SLOPE_MIN, lSlopeMax, L_DOMAIN_MAX);
		const cCurve = buildToneCurve(tgtStats.cAnchors, refStats.cAnchors, k, C_SLOPE_MIN, cSlopeMax, C_DOMAIN_MAX);

		// a/bの色相オフセットはグローバル統計から(従来通り)
		const globalRawScaleA = (tgtStats.globalA.std > 0.01) ? Math.min(SCALE_CAP, Math.min(refStats.globalA.std, REF_STD_CAP) / tgtStats.globalA.std) : 1;
		const globalScaleA = Math.max(SCALE_FLOOR, 1.0 + (globalRawScaleA - 1.0) * BLEND_STD);
		const B_a_global = (refStats.globalA.mean - tgtStats.globalA.mean * globalScaleA) * k * BLEND_MEAN_C;

		const globalRawScaleB = (tgtStats.globalB.std > 0.01) ? Math.min(SCALE_CAP, Math.min(refStats.globalB.std, REF_STD_CAP) / tgtStats.globalB.std) : 1;
		const globalScaleB = Math.max(SCALE_FLOOR, 1.0 + (globalRawScaleB - 1.0) * BLEND_STD);
		const B_b_global = (refStats.globalB.mean - tgtStats.globalB.mean * globalScaleB) * k * BLEND_MEAN_C;

		let clampedLCount = 0;
		let clampedCCount = 0;
		let sumLOut = 0, sumCOut = 0, sumAOut = 0, sumBOut = 0;
		const totalPixels = outData.length / 4;

		for (let i = 0; i < outData.length; i += 4) {
			const [l, a, b] = rgb2lab(outData[i], outData[i + 1], outData[i + 2]);
			const c = Math.sqrt(a * a + b * b);

			let l_new = sampleToneCurve(lCurve, l);

			// 彩度はカーブが返す目標Cへの倍率としてa/bに適用(色相を保つ)
			const cRatio = c > 1e-6 ? sampleToneCurve(cCurve, c) / c : 1.0;

			let a_new_raw = a * cRatio + B_a_global;
			let b_new_raw = b * cRatio + B_b_global;

			// クランプと保護処理 (v1と同等)
			if (refStats.percentiles) {
				if (l_new > refStats.percentiles.lMax95) {
					l_new = refStats.percentiles.lMax95 + (l_new - refStats.percentiles.lMax95) * 0.2;
					clampedLCount++;
				}
				const c_new = Math.sqrt(a_new_raw * a_new_raw + b_new_raw * b_new_raw);
				if (c_new > refStats.percentiles.cMax95 && c_new > 0.01) {
					const over = c_new - refStats.percentiles.cMax95;
					const c_clamped = refStats.percentiles.cMax95 + over * 0.3;
					const ratio = c_clamped / c_new;
					a_new_raw *= ratio;
					b_new_raw *= ratio;
					clampedCCount++;
				}
			}

			// 既定のコントラスト強調。0.5を軸に暗部を沈める副作用があるため、
			// シャドウが強すぎる傾向を緩めるべく 1.1→1.05 に弱めた(既定シャドウの引き締め緩和)
			l_new = (l_new - 0.5) * 1.05 + 0.5;
			l_new = applyShadowCrush(l_new, shadowStrength);

			let weight = 1.0;
			if (l > 0.90) {
				weight = Math.max(0, 1.0 - (l - 0.90) * 10.0);
			} else if (l < 0.08) {
				weight = Math.max(0, l * 12.5);
			}

			const a_final_pre = a + (a_new_raw - a) * weight;
			const b_final_pre = b + (b_new_raw - b) * weight;

			const [a_final, b_final] = applySaturationAdjustment(a_final_pre, b_final_pre, saturation);

			sumLOut += l_new;
			sumCOut += Math.sqrt(a_final * a_final + b_final * b_final);
			sumAOut += a_final;
			sumBOut += b_final;

			const [r, g, bb] = lab2rgb(l_new, a_final, b_final);
			outData[i] = r;
			outData[i + 1] = g;
			outData[i + 2] = bb;
		}

		if (debugOut) {
			debugOut.debugInfo = {
				refLMean: refStats.globalL.mean,
				refLStd: refStats.globalL.std,
				refCMean: refStats.globalC.mean,
				refAMean: refStats.globalA.mean,
				refBMean: refStats.globalB.mean,
				tgtLMean: tgtStats.globalL.mean,
				tgtLStd: tgtStats.globalL.std,
				tgtCMean: tgtStats.globalC.mean,
				tgtAMean: tgtStats.globalA.mean,
				tgtBMean: tgtStats.globalB.mean,
				outLMean: sumLOut / totalPixels,
				outCMean: sumCOut / totalPixels,
				outAMean: sumAOut / totalPixels,
				outBMean: sumBOut / totalPixels,
				clampedLPercent: (clampedLCount / totalPixels) * 100,
				clampedCPercent: (clampedCCount / totalPixels) * 100,
				distance: dist,
				distanceFactor: distanceFactor,
				scaleA_std: globalScaleA,
				scaleB_std: globalScaleB,
				toneCurveL: { x: lCurve.anchorsX, y: lCurve.anchorsY, slopes: lCurve.slopes, cap: lSlopeMax },
				toneCurveC: { x: cCurve.anchorsX, y: cCurve.anchorsY, slopes: cCurve.slopes, cap: cSlopeMax }
			};
		}

		return output;
	};

	// Apply color transfer with variable intensity
	const processImageBuffer = (
		imgData: ImageData,
		refStats: ColorStats,
		tgtStats: ColorStats,
		intensity: number,
		shadowStrength: number = 50,
		saturation: number = 0,
		debugOut?: { debugInfo?: DebugInfo }
	): ImageData => {
		const data = imgData.data;
		// Clone data for output (don't mutate original if cached)
		const output = new ImageData(new Uint8ClampedArray(data), imgData.width, imgData.height);
		const outData = output.data;

		// Calculate interpolation factor, 0-100 -> 0.0-2.0
		// Oklab空間での平均値の距離 (Distance)
		const dL = refStats.mean[0] - tgtStats.mean[0];
		const da = refStats.mean[1] - tgtStats.mean[1];
		const db = refStats.mean[2] - tgtStats.mean[2];
		const dist = Math.sqrt(dL * dL + da * da + db * db);

		// 距離が小さい（＝似ている）ほど強度を落とす
		// dist=0 -> factor=0.3, dist>=0.1 -> factor=1.0 に近づく
		let distanceFactor = Math.min(1.0, 0.3 + (dist * 7.0));

		// 元画像の彩度がお手本より高い場合、無条件に下げすぎないよう下限を設ける
		const tgtC = Math.sqrt(tgtStats.mean[1]**2 + tgtStats.mean[2]**2);
		const refC = Math.sqrt(refStats.mean[1]**2 + refStats.mean[2]**2);
		if (tgtC > refC) {
			distanceFactor = Math.max(distanceFactor, 0.6);
		}

		// ユーザー操作の反映：intensityがデフォルト(50)から離れるほど、distanceFactorを1.0(無効化)に近づける
		const userIntent = Math.abs(intensity - 50) / 50.0;
		distanceFactor = distanceFactor + (1.0 - distanceFactor) * userIntent;

		// ユーザーフィードバック:
		// 「強度35くらいがベスト。今の35を、新しい50(デフォルト)にしてほしい」
		const k = (intensity / 114.0) * distanceFactor;

		// Pre-calculate global constants for speed
		const SCALE_CAP = 3.0; // 最大3倍まで
		const SCALE_FLOOR = 0.7; // 彩度縮小の下限キャップ
		const REF_STD_CAP = 0.18;

		const effectiveRefStdL = Math.min(refStats.std[0], REF_STD_CAP);
		const effectiveRefStdA = Math.min(refStats.std[1], REF_STD_CAP);
		const effectiveRefStdB = Math.min(refStats.std[2], REF_STD_CAP);

		// 生の倍率
		const rawScaleL = (tgtStats.std[0] > 0.01) ? Math.min(SCALE_CAP, effectiveRefStdL / tgtStats.std[0]) : 1;
		const rawScaleA = (tgtStats.std[1] > 0.01) ? Math.min(SCALE_CAP, effectiveRefStdA / tgtStats.std[1]) : 1;
		const rawScaleB = (tgtStats.std[2] > 0.01) ? Math.min(SCALE_CAP, effectiveRefStdB / tgtStats.std[2]) : 1;

		const BLEND_STD = 0.95;
		const scaleL_std = 1.0 + (rawScaleL - 1.0) * BLEND_STD;
		let scaleA_std = 1.0 + (rawScaleA - 1.0) * BLEND_STD;
		let scaleB_std = 1.0 + (rawScaleB - 1.0) * BLEND_STD;

		scaleA_std = Math.max(scaleA_std, SCALE_FLOOR);
		scaleB_std = Math.max(scaleB_std, SCALE_FLOOR);

		const BLEND_MEAN_L = 0.8;
		const BLEND_MEAN_C = 0.8;

		// Coefficients
		const A_L = 1 + (scaleL_std - 1) * k;
		const B_L = (refStats.mean[0] - tgtStats.mean[0] * scaleL_std) * k * BLEND_MEAN_L;

		const A_a = 1 + (scaleA_std - 1) * k;
		const B_a = (refStats.mean[1] - tgtStats.mean[1] * scaleA_std) * k * BLEND_MEAN_C;

		const A_b = 1 + (scaleB_std - 1) * k;
		const B_b = (refStats.mean[2] - tgtStats.mean[2] * scaleB_std) * k * BLEND_MEAN_C;

		// Debug counters
		let clampedLCount = 0;
		let clampedCCount = 0;
		let sumLOut = 0;
		let sumCOut = 0;
		let sumAOut = 0;
		let sumBOut = 0;
		const totalPixels = outData.length / 4;

		for (let i = 0; i < outData.length; i += 4) {
			const [l, a, b] = rgb2lab(outData[i], outData[i + 1], outData[i + 2]);

			let l_new = l * A_L + B_L;
			let a_new_raw = a * A_a + B_a;
			let b_new_raw = b * A_b + B_b;

			// 出力クランプ (Absolute Clamp for Lightness and Saturation)
			if (refStats.percentiles) {
				// 明度のクランプ
				if (l_new > refStats.percentiles.lMax95) {
					l_new = refStats.percentiles.lMax95 + (l_new - refStats.percentiles.lMax95) * 0.2; // ソフトクリップ
					clampedLCount++;
				}
				// 彩度のクランプ
				const c_new = Math.sqrt(a_new_raw * a_new_raw + b_new_raw * b_new_raw);
				if (c_new > refStats.percentiles.cMax95 && c_new > 0.01) {
					const over = c_new - refStats.percentiles.cMax95;
					const c_clamped = refStats.percentiles.cMax95 + over * 0.3; // 超過分を30%に圧縮
					const ratio = c_clamped / c_new;
					a_new_raw *= ratio;
					b_new_raw *= ratio;
					clampedCCount++;
				}
			}

			// コントラスト微増強
			l_new = (l_new - 0.5) * 1.1 + 0.5;

			// 強力なシャドウ引き締め（独立関数）
			l_new = applyShadowCrush(l_new, shadowStrength);

			// ハイライト・シャドウ保護
			let weight = 1.0;
			if (l > 0.90) {
				weight = Math.max(0, 1.0 - (l - 0.90) * 10.0);
			} else if (l < 0.08) {
				weight = Math.max(0, l * 12.5);
			}

			const a_final_pre = a + (a_new_raw - a) * weight;
			const b_final_pre = b + (b_new_raw - b) * weight;

			// 彩度スライダーによる最終調整（独立関数）
			const [a_final, b_final] = applySaturationAdjustment(a_final_pre, b_final_pre, saturation);

			// 統計用
			sumLOut += l_new;
			const c_final = Math.sqrt(a_final * a_final + b_final * b_final);
			sumCOut += c_final;
			sumAOut += a_final;
			sumBOut += b_final;

			const [r, g, bb] = lab2rgb(l_new, a_final, b_final);
			outData[i] = r;
			outData[i + 1] = g;
			outData[i + 2] = bb;
		}

		if (debugOut) {
			debugOut.debugInfo = {
				refLMean: refStats.mean[0],
				refLStd: refStats.std[0],
				refCMean: Math.sqrt(refStats.mean[1]**2 + refStats.mean[2]**2),
				refAMean: refStats.mean[1],
				refBMean: refStats.mean[2],
				tgtLMean: tgtStats.mean[0],
				tgtLStd: tgtStats.std[0],
				tgtCMean: Math.sqrt(tgtStats.mean[1]**2 + tgtStats.mean[2]**2),
				tgtAMean: tgtStats.mean[1],
				tgtBMean: tgtStats.mean[2],
				outLMean: sumLOut / totalPixels,
				outCMean: sumCOut / totalPixels,
				outAMean: sumAOut / totalPixels,
				outBMean: sumBOut / totalPixels,
				clampedLPercent: (clampedLCount / totalPixels) * 100,
				clampedCPercent: (clampedCCount / totalPixels) * 100,
				distance: dist,
				distanceFactor: distanceFactor,
				scaleA_std: scaleA_std,
				scaleB_std: scaleB_std
			};
		}

		return output;
	};

	const executeColorTransfer = async () => {
		if (!reference || targets.length === 0) return;

		setProcessStatus({ isProcessing: true, message: t.statusAnalyzing, progress: 5 });
		setImageCache({}); // Clear cache

		try {
			const refResized = resizeImageCanvas(reference.element, RESIZE_LONG_EDGE);
			let refStats: ColorStats | ColorStatsV2;
			if (algorithmVersion === 'v1') {
				refStats = computeStats(refResized.ctx, refResized.width, refResized.height);
			} else {
				refStats = computeStatsV2(refResized.ctx, refResized.width, refResized.height);
			}

			const newResults: ResultState[] = [];

			for (let i = 0; i < targets.length; i++) {
				const currentProgress = 10 + Math.round((i / targets.length) * 85);
				setProcessStatus({
					isProcessing: true,
					message: `${t.statusProcessing} (${i + 1}/${targets.length})`,
					progress: currentProgress
				});

				// 1. Prepare preview size
				const previewResized = resizeImageCanvas(targets[i].element, PREVIEW_EDGE);
				let tgtStats: ColorStats | ColorStatsV2;
				if (algorithmVersion === 'v1') {
					tgtStats = computeStats(previewResized.ctx, previewResized.width, previewResized.height);
				} else {
					tgtStats = computeStatsV2(previewResized.ctx, previewResized.width, previewResized.height);
				}

				// 2. Cache original data for slider updates
				imageCache.current[i] = {
					ctx: previewResized.ctx,
					width: previewResized.width,
					height: previewResized.height,
					tgtStats: tgtStats,
					refStats: refStats,
					algorithmVersion: algorithmVersion
				};

				// 3. Process initial result (Intensity 35 - 内部値)
				const initialDisplayIntensity = 50;
				const initialInternalIntensity = mapDisplayToInternal(initialDisplayIntensity); // = 35

				const debugOut: { debugInfo?: DebugInfo } = {};
				const imgData = previewResized.ctx.getImageData(0, 0, previewResized.width, previewResized.height);
				let processed: ImageData;
				if (algorithmVersion === 'v1') {
					processed = processImageBuffer(imgData, refStats as ColorStats, tgtStats as ColorStats, initialInternalIntensity, 50, 0, debugOut);
				} else {
					processed = processImageBufferV2(imgData, refStats as ColorStatsV2, tgtStats as ColorStatsV2, initialInternalIntensity, 50, 0, debugOut);
				}

				// Draw to canvas to get URL
				const canvas = document.createElement('canvas');
				canvas.width = previewResized.width;
				canvas.height = previewResized.height;
				const ctx = canvas.getContext('2d')!;
				ctx.putImageData(processed, 0, 0);

				newResults.push({
					name: targets[i].file.name,
					originalUrl: targets[i].url,
					resultUrl: canvas.toDataURL('image/jpeg', 0.9),
					intensity: initialDisplayIntensity,
					shadow: 50,
					saturation: 0,
					id: i,
					debugInfo: debugOut.debugInfo
				});

				await new Promise(r => setTimeout(r, 20)); // Yield to UI
			}

			setResults(newResults);
			setProcessStatus({ isProcessing: false, message: t.statusDone, progress: 100 });

			// Auto scroll to results
			setTimeout(() => {
				resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}, 100);

		} catch (e) {
			console.error(e);
			setErrorMessage("Processing failed.");
			setProcessStatus({ isProcessing: false, message: '', progress: 0 });
		}
	};

	// Handle individual intensity change
	const handleIntensityChange = (id: number, val: number) => {
		setResults(prev => prev.map(r => r.id === id ? { ...r, intensity: val } : r));

		// Debounce re-processing
		if (workerRef.current[id]) clearTimeout(workerRef.current[id]);
		workerRef.current[id] = setTimeout(async () => {
			const target = targets[id];
			const resInfo = results.find(r => r.id === id);
			if (!target || !imageCache.current[id]) return;

			const { ctx: previewCtx, width: previewWidth, height: previewHeight, tgtStats, refStats, algorithmVersion: cachedAlg } = imageCache.current[id];
			const currentShadow = resInfo?.shadow ?? 50;
			const currentSaturation = resInfo?.saturation ?? 0;

			const internalIntensity = mapDisplayToInternal(val);

			// Re-process
			const debugOut: { debugInfo?: DebugInfo } = {};
			const imgData = previewCtx.getImageData(0, 0, previewWidth, previewHeight);
			let processed: ImageData;
			if (cachedAlg === 'v1') {
				processed = processImageBuffer(imgData, refStats as ColorStats, tgtStats as ColorStats, internalIntensity, currentShadow, currentSaturation, debugOut);
			} else {
				processed = processImageBufferV2(imgData, refStats as ColorStatsV2, tgtStats as ColorStatsV2, internalIntensity, currentShadow, currentSaturation, debugOut);
			}

			const canvas = document.createElement('canvas');
			canvas.width = previewWidth;
			canvas.height = previewHeight;
			const ctx = canvas.getContext('2d')!;
			ctx.putImageData(processed, 0, 0);

			setResults(prev => prev.map(r => r.id === id ? { ...r, resultUrl: canvas.toDataURL('image/jpeg', 0.9), debugInfo: debugOut.debugInfo } : r));
		}, 100); // 100ms debounce
	};

	// Handle individual saturation change
	const handleSaturationChange = (id: number, val: number) => {
		setResults(prev => prev.map(r => r.id === id ? { ...r, saturation: val } : r));

		if (workerRef.current[id]) clearTimeout(workerRef.current[id]);
		workerRef.current[id] = setTimeout(async () => {
			const target = targets[id];
			const resInfo = results.find(r => r.id === id);
			if (!target || !imageCache.current[id]) return;

			const { ctx: previewCtx, width: previewWidth, height: previewHeight, tgtStats, refStats, algorithmVersion: cachedAlg } = imageCache.current[id];
			const currentIntensityDisplay = resInfo?.intensity ?? 50;
			const currentIntensityInternal = mapDisplayToInternal(currentIntensityDisplay);
			const currentShadow = resInfo?.shadow ?? 50;

			// Re-process
			const debugOut: { debugInfo?: DebugInfo } = {};
			const imgData = previewCtx.getImageData(0, 0, previewWidth, previewHeight);
			let processed: ImageData;
			if (cachedAlg === 'v1') {
				processed = processImageBuffer(imgData, refStats as ColorStats, tgtStats as ColorStats, currentIntensityInternal, currentShadow, val, debugOut);
			} else {
				processed = processImageBufferV2(imgData, refStats as ColorStatsV2, tgtStats as ColorStatsV2, currentIntensityInternal, currentShadow, val, debugOut);
			}

			const canvas = document.createElement('canvas');
			canvas.width = previewWidth;
			canvas.height = previewHeight;
			const ctx = canvas.getContext('2d')!;
			ctx.putImageData(processed, 0, 0);

			setResults(prev => prev.map(r => r.id === id ? { ...r, resultUrl: canvas.toDataURL('image/jpeg', 0.9), debugInfo: debugOut.debugInfo } : r));
		}, 100);
	};

	// Handle individual shadow change
	const handleShadowChange = (id: number, val: number) => {
		setResults(prev => prev.map(r => r.id === id ? { ...r, shadow: val } : r));

		// Debounce re-processing
		if (workerRef.current[id]) clearTimeout(workerRef.current[id]);
		workerRef.current[id] = setTimeout(async () => {
			const target = targets[id];
			const resInfo = results.find(r => r.id === id);
			if (!target || !imageCache.current[id]) return;

			const { ctx: previewCtx, width: previewWidth, height: previewHeight, tgtStats, refStats, algorithmVersion: cachedAlg } = imageCache.current[id];
			const currentIntensityDisplay = resInfo?.intensity ?? 50;
			const currentIntensityInternal = mapDisplayToInternal(currentIntensityDisplay);
			const currentSaturation = resInfo?.saturation ?? 0;

			// Re-process
			const debugOut: { debugInfo?: DebugInfo } = {};
			const imgData = previewCtx.getImageData(0, 0, previewWidth, previewHeight);
			let processed: ImageData;
			if (cachedAlg === 'v1') {
				processed = processImageBuffer(imgData, refStats as ColorStats, tgtStats as ColorStats, currentIntensityInternal, val, currentSaturation, debugOut);
			} else {
				processed = processImageBufferV2(imgData, refStats as ColorStatsV2, tgtStats as ColorStatsV2, currentIntensityInternal, val, currentSaturation, debugOut);
			}

			const canvas = document.createElement('canvas');
			canvas.width = previewWidth;
			canvas.height = previewHeight;
			const ctx = canvas.getContext('2d')!;
			ctx.putImageData(processed, 0, 0);

			setResults(prev => prev.map(r => r.id === id ? { ...r, resultUrl: canvas.toDataURL('image/jpeg', 0.9), debugInfo: debugOut.debugInfo } : r));
		}, 100); // 100ms debounce
	};

	function setImageCache(arg0: {}) {
		imageCache.current = arg0;
	}

	const handleDownloadZip = async () => {
		if (!reference || targets.length === 0 || results.length === 0) return;

		setProcessStatus({ isProcessing: true, message: t.statusGenZip, progress: 10 });

		try {
			const zip = new JSZip();
			const refResized = resizeImageCanvas(reference.element, RESIZE_LONG_EDGE);
			let refStats: ColorStats | ColorStatsV2;
			if (algorithmVersion === 'v1') {
				refStats = computeStats(refResized.ctx, refResized.width, refResized.height);
			} else {
				refStats = computeStatsV2(refResized.ctx, refResized.width, refResized.height);
			}

			for (let i = 0; i < targets.length; i++) {
				const res = results[i];
				setProcessStatus({
					isProcessing: true,
					message: `${res.name}...`,
					progress: 10 + Math.round((i / targets.length) * 80)
				});

				// Resize target
				const tgtResized = resizeImageCanvas(targets[i].element, RESIZE_LONG_EDGE);
				let tgtStats: ColorStats | ColorStatsV2;
				if (algorithmVersion === 'v1') {
					tgtStats = computeStats(tgtResized.ctx, tgtResized.width, tgtResized.height);
				} else {
					tgtStats = computeStatsV2(tgtResized.ctx, tgtResized.width, tgtResized.height);
				}

				// Process FULL size with current intensity slider value
				const imgData = tgtResized.ctx.getImageData(0, 0, tgtResized.width, tgtResized.height);
				let processed: ImageData;
				const internalIntensity = mapDisplayToInternal(res.intensity);
				if (algorithmVersion === 'v1') {
					processed = processImageBuffer(imgData, refStats as ColorStats, tgtStats as ColorStats, internalIntensity, res.shadow, res.saturation);
				} else {
					processed = processImageBufferV2(imgData, refStats as ColorStatsV2, tgtStats as ColorStatsV2, internalIntensity, res.shadow, res.saturation);
				}

				const canvas = document.createElement('canvas');
				canvas.width = tgtResized.width;
				canvas.height = tgtResized.height;
				const ctx = canvas.getContext('2d')!;
				ctx.putImageData(processed, 0, 0);

				const fullResUrl = canvas.toDataURL('image/jpeg', 0.92);
				const data = fullResUrl.split(',')[1];
				zip.file(targets[i].file.name.replace(/\.[^/.]+$/, "") + "_adjusted.jpg", data, { base64: true });
			}

			setProcessStatus({ isProcessing: true, message: t.statusCreatingZip, progress: 95 });
			const content = await zip.generateAsync({ type: 'blob' });
			const link = document.createElement('a');
			link.href = URL.createObjectURL(content);
			link.download = "color_adjusted_images.zip";
			link.click();

			setProcessStatus({ isProcessing: false, message: t.statusDone, progress: 100 });
		} catch (e) {
			console.error(e);
			setErrorMessage(t.msgZipFail);
			setProcessStatus({ isProcessing: false, message: '', progress: 0 });
		}
	};

	return (
		<div className="w-full md:w-[90%] lg:w-[85%] max-w-[1800px] mx-auto py-8 space-y-8 relative">
			{/* Reset Confirmation Modal */}
			{isResetModalOpen && (
				<div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
					<div
						className="absolute inset-0 bg-black/60 backdrop-blur-sm"
						onClick={() => setIsResetModalOpen(false)}
					/>
					<div className="relative bg-[#1e1e24]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.6)] animate-in zoom-in-95 duration-200 ring-1 ring-white/5">
						<h3 className="text-xl font-bold text-white mb-2 tracking-tight">
							{(t as any).modal_reset_title}
						</h3>
						<p className="text-gray-400 mb-8 leading-relaxed text-sm">
							{(t as any).modal_reset_desc}
						</p>
						<div className="flex gap-3 justify-end">
							<button
								onClick={() => setIsResetModalOpen(false)}
								className="px-4 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all font-bold text-sm"
							>
								{(t as any).modal_cancel}
							</button>
							<button
								onClick={performReset}
								className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-400 hover:to-pink-500 text-white font-bold shadow-lg shadow-red-900/40 transition-all transform hover:-translate-y-0.5 active:scale-95 text-sm"
							>
								{(t as any).modal_confirm}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Hamburger Menu Button */}
			<div className="absolute top-0 left-4 md:left-0 z-50">
				<button
					onClick={() => setIsMenuOpen(true)}
					className="p-2 text-white/50 hover:text-white transition-colors active:scale-95"
					aria-label="Menu"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
						<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
					</svg>
				</button>
			</div>

			{/* Slide-in Menu Overlay & Content */}
			{/* Overlay */}
			<div
				className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-300 backdrop-blur-sm ${isMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
				onClick={() => setIsMenuOpen(false)}
			/>

			{/* Menu Panel */}
			<div
				className={`fixed inset-y-0 left-0 w-86 bg-[#0a0a0e]/95 backdrop-blur-xl z-[70] transform transition-transform duration-300 ease-in-out border-r border-white/10 shadow-2xl flex flex-col ${isMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
			>
				{/* Close Button */}
				<div className="p-4 flex justify-end">
					<button
						onClick={() => setIsMenuOpen(false)}
						className="text-gray-400 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/10"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
							<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				{/* Content */}
				<div className="px-6 pb-8 flex flex-col flex-grow overflow-y-auto custom-scrollbar">
					{/* Top Content */}
					<div className="space-y-8">
						{/* Section 1: App Info */}
						<div className="space-y-3">
							<div className="flex items-center gap-3">
								<img src="/logo.png" alt="iroAwase" className="w-8 h-8 object-contain" />
								<h2 className="text-2xl font-bold text-white leading-none tracking-tight" style={{ fontFamily: 'var(--font-comfortaa)' }}>iroAwase</h2>
							</div>
							<p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">v1.2</p>
							<p className="text-sm text-gray-400 leading-relaxed font-medium">{(t as any).menu_app_desc}</p>
						</div>

						<div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

						{/* Section 2: Related Tools */}
						<div className="space-y-4">
							<h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.2em]">{(t as any).menu_related}</h3>
							<a
								href="https://karuku-suru.vercel.app/"
								target="_blank"
								rel="noopener noreferrer"
								className="group block bg-white/[0.03] rounded-2xl p-4 hover:bg-white/[0.08] transition-all border border-white/5 hover:border-indigo-500/30 shadow-lg"
							>
								<div className="flex items-center gap-4 mb-3">
									<div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center p-2 group-hover:scale-110 transition-transform">
										<img src="/karukusuru-logo.png" alt="karukuSuru" className="w-full h-full object-contain" />
									</div>
									<div>
										<p className="text-white font-bold group-hover:text-indigo-400 transition-colors">karukuSuru</p>
										<p className="text-[10px] text-gray-500 font-medium">Image Resizer & Optimizer</p>
									</div>
								</div>
								<p className="text-xs text-gray-400 mb-4 leading-relaxed line-clamp-2">{(t as any).menu_karukusuru_desc}</p>
								<div className="flex items-center justify-end">
									<span className="text-[11px] text-indigo-400 group-hover:text-indigo-300 flex items-center font-bold gap-1 transition-colors">
										{(t as any).menu_open}
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
											<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
										</svg>
									</span>
								</div>
							</a>
						</div>
					</div>

					{/* Bottom Content (About) */}
					<div className="mt-auto pt-8">
						<div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-8" />

						{/* Section 3: About */}
						<div className="space-y-6">
							<h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.2em]">{(t as any).menu_about}</h3>
							<div className="space-y-2.5">
								<p className="text-xs text-gray-400 font-medium tracking-tight">{(t as any).menu_privacy}</p>
								<p className="text-xs text-gray-400 font-medium tracking-tight">{(t as any).menu_client_side}</p>
								<p className="pt-4 text-[10px] text-gray-600 font-mono tracking-tight uppercase">© 2026 CodeAtelier Yu</p>
							</div>

							<a
								href="https://x.com/CodeAtelierYu"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-3 text-gray-500 hover:text-[#1d9bf0] transition-all p-2 -ml-2 rounded-xl hover:bg-[#1d9bf0]/5 group"
							>
								<svg viewBox="0 0 24 24" className="w-5 h-5 fill-current transition-transform group-hover:scale-110" aria-hidden="true">
									<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
								</svg>
								<span className="text-xs font-bold uppercase tracking-wider">Follow for updates</span>
							</a>
						</div>
					</div>
				</div>
			</div>

			{/* Language Switcher */}
			<div className="absolute top-0 right-4 md:right-0 z-50">
				<div className="flex bg-white/5 backdrop-blur-md rounded-xl p-1 text-xs font-bold border border-white/10 shadow-2xl">
					<button
						onClick={() => setLanguage('ja')}
						className={`px-3 py-1.5 rounded-md transition-all ${language === 'ja' ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
					>
						JP
					</button>
					<button
						onClick={() => setLanguage('en')}
						className={`px-3 py-1.5 rounded-md transition-all ${language === 'en' ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
					>
						EN
					</button>
				</div>
			</div>

			{/* Header */}
			<div className="flex flex-col items-center gap-2 mt-8 md:mt-0 pb-4">
				<div
					className="flex items-center justify-center gap-3 md:gap-4 select-none cursor-pointer"
					onClick={() => {
						setIsDebugMode(true);
						setShowDebugPanel(prev => !prev);
					}}
				>
					<img src="/logo.png" alt="iroAwase Logo" className="h-10 w-10 md:h-16 md:w-16 object-contain" />
					<h1 className="text-3xl md:text-5xl text-white tracking-wider pb-1" style={{ fontFamily: 'var(--font-comfortaa)' }}>
						iroAwase
					</h1>
				</div>
				<p className="text-gray-400 text-sm md:text-base">{t.subtitle}</p>
				<p className="text-gray-500 text-xs md:text-sm mt-1">{(t as any).privacyNotice}</p>
			</div>

			{/* Main Drop Zones */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-start relative px-4 md:px-0">
				{/* Reference */}
				<div className="flex flex-col gap-2">
					<h2 className="text-gray-300 text-sm flex items-center justify-between">
						<span className="flex items-center gap-2">{t.refTitle}</span>
						<span className="text-[10px] text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">{DISPLAY_ACCEPTED_FORMATS}</span>
					</h2>
					<div
						className="bg-white/5 backdrop-blur-sm rounded-3xl aspect-[3/2] relative flex flex-col items-center justify-center text-gray-300 overflow-hidden group cursor-pointer border border-white/10 transition-all hover:bg-white/10 hover:border-white/20"
						onDragOver={(e) => e.preventDefault()}
						onDrop={(e) => handleFileSelect(e, 'reference')}
					>
						<input type="file" accept={ACCEPTED_EXTENSIONS.join(',')} onChange={(e) => handleFileSelect(e, 'reference')} className="absolute inset-0 opacity-0 cursor-pointer z-20" />

						{reference ? (
							<div className="flex flex-col items-center justify-center w-full h-full p-6 gap-3">
								<img src={reference.url} alt="Reference" className="max-w-full max-h-[85%] object-contain shadow-2xl rounded-lg z-10" />
								<p className="text-xs text-white font-medium bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md group-hover:bg-white/20 transition-colors z-10 border border-white/10">
									{t.changeRef}
								</p>
							</div>
						) : (
							<div className="flex flex-col items-center gap-4 pointer-events-none group-hover:scale-105 transition-transform duration-300">
								<div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-white/30 group-hover:text-white/60 group-hover:border-white/20 transition-colors">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
										<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
									</svg>
								</div>
								<p className="text-sm font-medium text-gray-400 group-hover:text-white text-center leading-relaxed whitespace-pre-wrap">
									{t.dropRef}<br />
								</p>
							</div>
						)}
					</div>
				</div>

				{/* Target */}
				<div className="flex flex-col gap-2">
					<h2 className="text-gray-300 text-sm flex items-center justify-between">
						<span className="flex items-center gap-2">{t.targetTitle}</span>
						<div className="flex items-center gap-2">
							<span className="text-[10px] text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">{DISPLAY_ACCEPTED_FORMATS}</span>
							{targets.length > 0 && <span className="text-xs text-indigo-400">{targets.length} {t.targetCount}</span>}
						</div>
					</h2>
					<div
						className="bg-white/5 backdrop-blur-sm rounded-3xl aspect-[3/2] relative flex flex-col items-center justify-center text-gray-300 overflow-hidden group cursor-pointer border border-white/10 transition-all hover:bg-white/10 hover:border-white/20"
						onDragOver={(e) => e.preventDefault()}
						onDrop={(e) => handleFileSelect(e, 'target')}
					>
						<input type="file" accept={ACCEPTED_EXTENSIONS.join(',')} multiple onChange={(e) => handleFileSelect(e, 'target')} className="absolute inset-0 opacity-0 cursor-pointer z-20" />

						{targets.length > 0 ? (
							<div className="p-4 w-full h-full z-10 overflow-y-auto custom-scrollbar">
								<div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
									{targets.map((tgt, i) => (
										<div key={i} className="relative aspect-square bg-white/5 rounded-xl overflow-hidden border border-white/10 shadow-lg group/item">
											<img src={tgt.url} className="w-full h-full object-cover transition-transform group-hover/item:scale-110" alt={`target-${i}`} />
											<div className="absolute inset-0 bg-black/40 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center">
												<span className="text-[10px] text-white font-bold">#{i + 1}</span>
											</div>
											<button
												onClick={(e) => { e.stopPropagation(); handleRemoveTarget(i); }}
												className="absolute top-1 right-1 w-6 h-6 bg-black/40 hover:bg-red-500/80 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-all backdrop-blur-sm z-30 opacity-70 group-hover/item:opacity-100 group-hover/item:scale-110"
												title="削除"
											>
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
													<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
												</svg>
											</button>
										</div>
									))}
									<div className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-xl text-[10px] text-gray-500 font-medium bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all">
										{t.add}
									</div>
								</div>
							</div>
						) : (
							<div className="flex flex-col items-center gap-4 pointer-events-none group-hover:scale-105 transition-transform duration-300">
								<div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-white/30 group-hover:text-white/60 group-hover:border-white/20 transition-colors">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
										<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
									</svg>
								</div>
								<p className="text-sm font-medium text-gray-400 group-hover:text-white text-center leading-relaxed whitespace-pre-wrap">
									{t.dropTarget}
								</p>
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
					disabled={!reference || targets.length === 0 || processStatus.isProcessing}
					className="px-8 md:px-32 py-4 md:py-6 rounded-xl md:rounded-2xl font-bold text-lg md:text-2xl text-white shadow-2xl bg-indigo-600 hover:bg-indigo-500 transition-all transform hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none whitespace-nowrap border border-white/10"
				>
					{processStatus.isProcessing ? (
						<span className="flex items-center gap-3">
							<svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							{t.btnProcessing}
						</span>
					) : t.btnAdjust}
				</button>

				{/* Progress */}
				{(processStatus.isProcessing || (processStatus.progress > 0 && processStatus.progress < 100)) && (
					<div className="w-full max-w-[500px] space-y-3 pt-2 px-6 py-4 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-xl">
						<div className="flex justify-between text-xs font-bold text-gray-300 uppercase tracking-widest">
							<span>{processStatus.message}</span>
							<span className="text-indigo-400">{processStatus.progress}%</span>
						</div>
						<div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
							<div
								className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500 ease-out shadow-[0_0_15px_rgba(99,102,241,0.5)]"
								style={{ width: `${processStatus.progress}%` }}
							/>
						</div>
					</div>
				)}
			</div>

			{/* Result Area */}
			{results.length > 0 && (
				<div ref={resultsRef} className="animate-slide-up space-y-8 pt-8 border-t border-gray-800 scroll-mt-8 text-center sm:text-left">
					<div className="flex flex-col md:flex-row items-center justify-between gap-4 px-6 md:px-8">
						<h3 className="text-3xl font-bold text-gray-200 tracking-tight">{t.resultsTitle}</h3>
						{isDebugMode && (
							<button
								onClick={() => setShowDebugPanel(prev => !prev)}
								className="px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 text-xs font-bold rounded-lg border border-indigo-500/30 transition-all shadow-md active:scale-95"
							>
								{showDebugPanel ? "デバッグ情報を非表示" : "デバッグ情報を表示"}
							</button>
						)}
					</div>

					<div className="flex flex-col md:flex-row relative items-start">
						{/* Left Sidebar Panel (PC only) */}
						{results.length >= 2 && reference && (
							<div className="hidden md:flex flex-col w-[240px] shrink-0 sticky top-8 h-[calc(100vh-4rem)] overflow-y-auto px-6 border-r border-white/10" style={{ scrollbarWidth: 'none' }}>
								<p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left mb-4">Reference</p>
								<div className="relative w-full aspect-square rounded-xl overflow-hidden border-2 border-indigo-500/50 shadow-lg mb-8 shrink-0">
									<img src={reference.url} className="w-full h-full object-cover" alt="Reference" />
								</div>
								
								<p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left mb-4">{t.galleryTitle}</p>
								<div className="flex flex-col gap-3 items-end pr-2 pb-8" ref={sidebarListRef}>
									{results.map((res) => (
										<button
											key={`side-${res.id}`}
											onClick={() => scrollToResultCard(res.id)}
											data-thumb-id={res.id}
											className={`relative w-24 h-24 shrink-0 rounded-xl overflow-hidden border transition-all shadow-lg group ${activeCardId === res.id ? 'border-indigo-400 border-2' : 'border-white/10 hover:border-indigo-400/60'}`}
											title={res.name}
										>
											<img src={res.resultUrl} className="w-full h-full object-cover" alt={res.name} />
											<span className={`absolute bottom-1 left-1 right-1 text-[9px] text-white/90 bg-black/50 backdrop-blur-sm rounded px-1 py-0.5 truncate transition-opacity ${activeCardId === res.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
												{res.name}
											</span>
										</button>
									))}
								</div>
							</div>
						)}

						{/* Right Main Area */}
						<div className="flex-1 w-full overflow-hidden">
							{/* Mobile Gallery Floating Button & Drawer */}
							{results.length >= 2 && reference && (
								<>
									{/* Toggle Button */}
									<button
										onClick={() => setIsMobileGalleryOpen(!isMobileGalleryOpen)}
										className="md:hidden fixed bottom-24 right-4 z-50 bg-indigo-600/90 backdrop-blur-md text-white rounded-full p-4 shadow-[0_0_20px_rgba(79,70,229,0.3)] border border-white/20 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
									>
										<svg className={`w-6 h-6 transition-transform duration-300 ${isMobileGalleryOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
										</svg>
									</button>

									{/* Drawer */}
									<div className={`md:hidden fixed bottom-[5.5rem] left-4 right-[4.5rem] z-40 bg-[#0a0a0e]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-2xl transition-all duration-300 transform origin-bottom ${isMobileGalleryOpen ? 'scale-y-100 opacity-100 translate-y-0' : 'scale-y-95 opacity-0 translate-y-4 pointer-events-none'}`}>
										<p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left mb-3">{t.galleryTitle}</p>
										<div className="flex items-center gap-3">
											{/* お手本画像 (Reference) & 縦線 */}
											<div className="flex items-center gap-3 shrink-0">
												<div className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-indigo-500/50 shadow-lg">
													<img src={reference.url} className="w-full h-full object-cover" alt="Reference" />
													<span className="absolute bottom-0.5 left-0.5 right-0.5 text-[8px] text-white/90 bg-black/50 backdrop-blur-sm rounded px-1 py-0.5 truncate text-center">
														Ref
													</span>
												</div>
												<div className="h-16 w-[1px] bg-white/20"></div>
											</div>

											{/* 補正後画像群 (Scrollable) */}
											<div className="flex gap-2 overflow-x-auto pb-2 flex-nowrap" style={{ scrollbarWidth: 'none' }} ref={mobileListRef}>
												{results.map((res) => (
													<button
														key={`mob-${res.id}`}
														onClick={() => scrollToResultCard(res.id)}
														data-thumb-id={res.id}
														className={`relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border transition-all shadow-lg active:scale-95 group ${activeCardId === res.id ? 'border-indigo-400 border-2' : 'border-white/10'}`}
														title={res.name}
													>
														<img src={res.resultUrl} className="w-full h-full object-cover" alt={res.name} />
														<span className={`absolute bottom-0.5 left-0.5 right-0.5 text-[8px] text-white/90 bg-black/50 backdrop-blur-sm rounded px-1 py-0.5 truncate text-center transition-opacity ${activeCardId === res.id ? 'opacity-100' : 'opacity-0'}`}>
															{res.name}
														</span>
													</button>
												))}
											</div>
										</div>
									</div>
								</>
							)}

							<div className="space-y-12 pb-8">
								{results.map((res, i) => (
							<div
								key={i}
								ref={(el) => { cardRefs.current[res.id] = el; }}
								data-card-id={res.id}
								className={`space-y-6 bg-white/5 backdrop-blur-md py-8 rounded-3xl border transition-all shadow-2xl hover:bg-white/[0.07] scroll-mt-8 ${activeCardId === res.id ? 'border-indigo-500/50' : 'border-white/10 hover:border-white/20'} md:mx-4`}
							>
								<div className="flex justify-between items-center px-8">
									<h4 className="text-gray-300 font-bold flex items-center gap-2">
										<span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white/50 border border-white/10">{i + 1}</span>
										{res.name}
									</h4>
								</div>

								{/* Result Comparison */}
								<div className="flex flex-row items-center justify-center gap-2 md:gap-8 lg:gap-12 px-2 md:px-6">
									{/* Before */}
									<div className="flex flex-col items-center gap-3 flex-1">
										<div className="relative group w-full">
											<img src={res.originalUrl} className="w-full h-auto rounded-lg md:rounded-xl shadow-lg" alt="Before" />
											<span className="absolute top-2 left-2 md:top-4 md:left-4 bg-black/60 backdrop-blur-md text-white text-[10px] md:text-xs px-2 py-1 md:px-3 md:py-1.5 rounded-full font-bold uppercase tracking-wider">{t.before}</span>
										</div>
									</div>

									{/* Arrow */}
									<div className="text-indigo-500/50 hidden sm:block">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6 md:w-12 md:h-12">
											<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
										</svg>
									</div>

									{/* After */}
									<div className="flex flex-col items-center gap-3 flex-1">
										<div className="relative w-full">
											<img src={res.resultUrl} className="w-full h-auto rounded-lg md:rounded-xl shadow-[0_20px_50px_rgba(66,153,225,0.2)]" alt="After" />
											<span className="absolute top-2 left-2 md:top-4 md:left-4 bg-blue-500 text-white text-[10px] md:text-xs px-2 py-1 md:px-3 md:py-1.5 rounded-full font-bold uppercase tracking-wider ring-2 md:ring-4 ring-blue-500/20">{t.after}</span>
										</div>
									</div>
								</div>

								{/* Debug Panel */}
								{showDebugPanel && res.debugInfo && (
									<div className="max-w-[800px] mx-auto w-full px-4 md:px-8">
										<div className="bg-black/40 rounded-2xl p-4 md:p-6 border border-indigo-500/20 text-left text-xs font-mono space-y-4 text-gray-300">
											<div className="flex justify-between items-center border-b border-white/10 pb-2">
												<span className="text-indigo-400 font-bold">DEBUG PANEL</span>
												<span className="text-[10px] text-gray-500">Oklab Space Stats</span>
											</div>
											<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
												{/* Stats Table */}
												<div className="space-y-2">
													<p className="text-[10px] text-gray-400 font-bold uppercase">Basic Statistics (L & Chroma)</p>
													<table className="w-full text-[11px] border-collapse">
														<thead>
															<tr className="border-b border-white/5 text-gray-500 text-left">
																<th className="py-1">Metric</th>
																<th className="py-1">Ref</th>
																<th className="py-1">Target</th>
																<th className="py-1">Output</th>
															</tr>
														</thead>
														<tbody>
															<tr className="border-b border-white/5">
																<td className="py-1 font-bold">L Mean (Brightness)</td>
																<td className="py-1">{res.debugInfo.refLMean.toFixed(3)}</td>
																<td className="py-1">{res.debugInfo.tgtLMean.toFixed(3)}</td>
																<td className="py-1 text-indigo-300">{res.debugInfo.outLMean.toFixed(3)}</td>
															</tr>
															<tr className="border-b border-white/5">
																<td className="py-1 font-bold">L Std (Contrast)</td>
																<td className="py-1">{res.debugInfo.refLStd.toFixed(3)}</td>
																<td className="py-1">{res.debugInfo.tgtLStd.toFixed(3)}</td>
																<td className="py-1">-</td>
															</tr>
															<tr className="border-b border-white/5">
																<td className="py-1 font-bold">Chroma Mean (Sat)</td>
																<td className="py-1">{res.debugInfo.refCMean.toFixed(3)}</td>
																<td className="py-1">{res.debugInfo.tgtCMean.toFixed(3)}</td>
																<td className="py-1 text-indigo-300">{res.debugInfo.outCMean.toFixed(3)}</td>
															</tr>
														</tbody>
													</table>
												</div>

												{/* Color tendency (a, b) */}
												<div className="space-y-2">
													<p className="text-[10px] text-gray-400 font-bold uppercase">Color Tendency (a, b)</p>
													<table className="w-full text-[11px] border-collapse">
														<thead>
															<tr className="border-b border-white/5 text-gray-500 text-left">
																<th className="py-1">Axis</th>
																<th className="py-1">Ref</th>
																<th className="py-1">Target</th>
																<th className="py-1">Output</th>
															</tr>
														</thead>
														<tbody>
															<tr className="border-b border-white/5">
																<td className="py-1 font-bold">a (Green-Red)</td>
																<td className="py-1">{res.debugInfo.refAMean.toFixed(3)}</td>
																<td className="py-1">{res.debugInfo.tgtAMean.toFixed(3)}</td>
																<td className="py-1 text-indigo-300">{res.debugInfo.outAMean.toFixed(3)}</td>
															</tr>
															<tr className="border-b border-white/5">
																<td className="py-1 font-bold">b (Blue-Yellow)</td>
																<td className="py-1">{res.debugInfo.refBMean.toFixed(3)}</td>
																<td className="py-1">{res.debugInfo.tgtBMean.toFixed(3)}</td>
																<td className="py-1 text-indigo-300">{res.debugInfo.outBMean.toFixed(3)}</td>
															</tr>
														</tbody>
													</table>
												</div>
											</div>

											{/* Algorithmic variables */}
											<div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/10">
												<div className="space-y-1">
													<p className="text-[10px] text-gray-400 font-bold uppercase">Clamp Execution Rate</p>
													<div className="flex justify-between text-[11px]">
														<span>Lightness (L) Clamp:</span>
														<span className={res.debugInfo.clampedLPercent > 50 ? "text-red-400 font-bold" : "text-gray-300"}>
															{res.debugInfo.clampedLPercent.toFixed(1)}%
														</span>
													</div>
													<div className="flex justify-between text-[11px]">
														<span>Chroma (C) Clamp:</span>
														<span className={res.debugInfo.clampedCPercent > 50 ? "text-red-400 font-bold" : "text-gray-300"}>
															{res.debugInfo.clampedCPercent.toFixed(1)}%
														</span>
													</div>
												</div>
												<div className="space-y-1">
													<p className="text-[10px] text-gray-400 font-bold uppercase">Distance and Attenuation</p>
													<div className="flex justify-between text-[11px]">
														<span>Oklab Distance (D):</span>
														<span>{res.debugInfo.distance.toFixed(3)}</span>
													</div>
													<div className="flex justify-between text-[11px]">
														<span>Distance Factor:</span>
														<span className="text-emerald-400 font-bold">{res.debugInfo.distanceFactor.toFixed(3)}</span>
													</div>
													<div className="flex justify-between text-[11px]">
														<span>Scale A Std (Cap Applied):</span>
														<span className={res.debugInfo.scaleA_std !== undefined && res.debugInfo.scaleA_std < 0.75 ? "text-red-400 font-bold" : "text-gray-300"}>
															{res.debugInfo.scaleA_std?.toFixed(3) ?? '-'}
														</span>
													</div>
													<div className="flex justify-between text-[11px]">
														<span>Scale B Std (Cap Applied):</span>
														<span className={res.debugInfo.scaleB_std !== undefined && res.debugInfo.scaleB_std < 0.75 ? "text-red-400 font-bold" : "text-gray-300"}>
															{res.debugInfo.scaleB_std?.toFixed(3) ?? '-'}
														</span>
													</div>
												</div>
											</div>

											{/* V2 Tone Curve Anchors */}
											{res.debugInfo.toneCurveL && res.debugInfo.toneCurveC && (
												<div className="pt-2 border-t border-white/10 space-y-2">
													<p className="text-[10px] text-indigo-300 font-bold uppercase">V2 Tone Curve Anchors (In → Out / Slope)</p>
													<table className="w-full text-[11px] border-collapse">
														<thead>
															<tr className="border-b border-white/5 text-gray-500 text-left">
																<th className="py-1">#</th>
																<th className="py-1">L In</th>
																<th className="py-1">L Out</th>
																<th className="py-1">L Slope</th>
																<th className="py-1">C In</th>
																<th className="py-1">C Out</th>
																<th className="py-1">C Slope</th>
															</tr>
														</thead>
														<tbody>
															{res.debugInfo.toneCurveL.x.map((lx, idx) => {
																const tcL = res.debugInfo!.toneCurveL!;
																const tcC = res.debugInfo!.toneCurveC!;
																const lSlope = tcL.slopes[idx];
																const cSlope = tcC.slopes[idx];
																const slopeClass = (s: number | undefined, min: number, max: number) =>
																	s !== undefined && (s <= min + 0.01 || s >= max - 0.01) ? "text-red-400 font-bold" : "";
																return (
																	<tr key={idx} className="border-b border-white/5">
																		<td className="py-1 font-bold">{idx}</td>
																		<td className="py-1">{lx.toFixed(3)}</td>
																		<td className="py-1 text-indigo-300">{tcL.y[idx].toFixed(3)}</td>
																		<td className={`py-1 ${slopeClass(lSlope, L_SLOPE_MIN, tcL.cap)}`}>
																			{lSlope !== undefined ? lSlope.toFixed(2) : '-'}
																		</td>
																		<td className="py-1">{tcC.x[idx] !== undefined ? tcC.x[idx].toFixed(3) : '-'}</td>
																		<td className="py-1 text-indigo-300">{tcC.y[idx] !== undefined ? tcC.y[idx].toFixed(3) : '-'}</td>
																		<td className={`py-1 ${slopeClass(cSlope, C_SLOPE_MIN, tcC.cap)}`}>
																			{cSlope !== undefined ? cSlope.toFixed(2) : '-'}
																		</td>
																	</tr>
																);
															})}
														</tbody>
													</table>
												</div>
											)}
										</div>
									</div>
								)}

								{/* Slider Control */}
								<div className="max-w-[1000px] mx-auto w-full px-4 md:px-8">
									<div className="bg-black/20 rounded-2xl p-4 md:p-6 border border-white/5 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
										{/* Intensity */}
										<div className="flex flex-col gap-3">
											<div className="flex justify-between items-center">
												<span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">{t.sliderIntensity}</span>
											</div>
											<div className="flex justify-between text-[10px] text-gray-500 font-bold uppercase tracking-tighter px-1 mt-1">
												<span>{t.labelOriginal}</span>
												<span className="text-indigo-400/80">{t.labelStandard}</span>
												<span>{t.labelIntense}</span>
											</div>
											<div className="flex items-center gap-4">
												<input
													type="range"
													min="0"
													max="100"
													value={res.intensity}
													onChange={(e) => handleIntensityChange(i, parseInt(e.target.value))}
													className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
												/>
												<span className="w-8 text-right font-mono text-indigo-400 text-sm font-bold">{res.intensity}</span>
											</div>
										</div>

										{/* Saturation */}
										<div className="flex flex-col gap-3 mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-white/5 md:border-l md:border-white/10 md:pl-8">
											<div className="flex justify-between items-center">
												<span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">{t.sliderSaturation}</span>
											</div>
											<div className="flex justify-between text-[10px] text-gray-500 font-bold uppercase tracking-tighter px-1 mt-1">
												<span>-50</span>
												<span className="text-indigo-400/80">0</span>
												<span>+50</span>
											</div>
											<div className="flex items-center gap-4">
												<input
													type="range"
													min="-50"
													max="50"
													value={res.saturation}
													onChange={(e) => handleSaturationChange(i, parseInt(e.target.value))}
													className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
												/>
												<span className="w-8 text-right font-mono text-indigo-400 text-sm font-bold">{res.saturation > 0 ? `+${res.saturation}` : res.saturation}</span>
											</div>
										</div>

										{/* Shadow */}
										<div className="flex flex-col gap-3 mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-white/5 md:border-l md:border-white/10 md:pl-8">
											<div className="flex justify-between items-center">
												<span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">{t.sliderShadow}</span>
											</div>
											<div className="flex justify-between text-[10px] text-gray-500 font-bold uppercase tracking-tighter px-1 mt-1">
												<span>0</span>
												<span className="text-indigo-400/80">50</span>
												<span>100</span>
											</div>
											<div className="flex items-center gap-4">
												<input
													type="range"
													min="0"
													max="100"
													value={res.shadow}
													onChange={(e) => handleShadowChange(i, parseInt(e.target.value))}
													className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
												/>
												<span className="w-8 text-right font-mono text-indigo-400 text-sm font-bold">{res.shadow}</span>
											</div>
										</div>
									</div>
								</div>
							</div>
						))}
							</div>
							<div className="h-4" />
						</div>
					</div>
				</div>
			)}

			{/* Fixed Download Bar - Outside all results space to avoid parent transforms */}
			{results.length > 0 && (
				<div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-[550px] animate-slide-up px-4 sm:px-0">
					<div className="bg-[#1e1e24]/90 backdrop-blur-xl border border-white/15 rounded-2xl p-3 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex items-center justify-between gap-3 sm:gap-4 overflow-hidden">
						<div className="flex flex-col pl-2 hidden min-[400px]:flex">
							<span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Status</span>
							<span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
								<span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
								{results.length} / {targets.length} {t.statusDone}
							</span>
						</div>

						<button
							onClick={handleDownloadZip}
							disabled={processStatus.isProcessing}
							className="flex-1 px-4 sm:px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
								<path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
							</svg>
							{t.btnDownloadZip.split(" (")[0].replace(" 📦", "")}
						</button>

						<button
							onClick={handleResetClick}
							className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-all shadow-lg active:scale-95 shrink-0"
							title={t.btnReset}
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
								<path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
							</svg>
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
