/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from "@google/genai";

// pdfjsLib is loaded from the CDN script in index.html
declare const pdfjsLib: any;

// --- DOM Elements ---
const fileInput = document.getElementById('pdf-upload') as HTMLInputElement;
const loadingIndicator = document.getElementById('loading-indicator') as HTMLDivElement;
const contentWrapper = document.querySelector('.content-wrapper') as HTMLDivElement;
const canvasContainer = document.getElementById('canvas-container') as HTMLDivElement;
const controlPanel = document.getElementById('control-panel') as HTMLDivElement;
const analysisPanel = document.getElementById('analysis-panel') as HTMLDivElement;
const expandTextBtn = document.getElementById('expand-text-btn') as HTMLButtonElement;
const canvas = document.getElementById('reconstruction-canvas') as HTMLCanvasElement;
const textOutputCanvas = document.getElementById('text-output-canvas') as HTMLCanvasElement;
const groupDetailsContainer = document.getElementById('group-details-container') as HTMLDivElement;
const groupDetailsOutputEl = document.getElementById('group-details-output') as HTMLPreElement;
const toggleGroupDetailsLink = document.getElementById('toggle-group-details') as HTMLAnchorElement;

const geminiAnalyzeBtn = document.getElementById('gemini-analyze-btn') as HTMLButtonElement;
const geminiDialogOverlay = document.getElementById('gemini-dialog-overlay') as HTMLDivElement;
const geminiDialogContent = document.getElementById('gemini-dialog-content') as HTMLDivElement;
const geminiDialogCloseBtn = document.getElementById('gemini-dialog-close-btn') as HTMLButtonElement;

const context = canvas.getContext('2d')!;

// --- Control Panel Elements ---
const renditionModeAuto = document.getElementById('mode-auto') as HTMLInputElement;
const renditionModeManual = document.getElementById('mode-manual') as HTMLInputElement;
const manualControlsFieldset = document.getElementById('manual-controls-fieldset') as HTMLFieldSetElement;

const showItemBoxesCheckbox = document.getElementById('show-item-boxes') as HTMLInputElement;
const horizontalToleranceSlider = document.getElementById('horizontal-tolerance-slider') as HTMLInputElement;
const horizontalToleranceValue = document.getElementById('horizontal-tolerance-value') as HTMLSpanElement;
const verticalProximitySlider = document.getElementById('vertical-proximity-slider') as HTMLInputElement;
const verticalProximityValue = document.getElementById('vertical-proximity-value') as HTMLSpanElement;
const showBlockBoxesCheckbox = document.getElementById('show-block-boxes') as HTMLInputElement;
const yAxisToleranceSlider = document.getElementById('y-axis-tolerance-slider') as HTMLInputElement;
const yAxisToleranceValue = document.getElementById('y-axis-tolerance-value') as HTMLSpanElement;
const showLabelValueBoxesCheckbox = document.getElementById('show-label-value-boxes') as HTMLInputElement;
const titleRatioSlider = document.getElementById('title-ratio-slider') as HTMLInputElement;
const titleRatioValue = document.getElementById('title-ratio-value') as HTMLSpanElement;
const showTitlesCheckbox = document.getElementById('show-titles') as HTMLInputElement;
const exportSettingsBtn = document.getElementById('export-settings-btn') as HTMLButtonElement;
const importSettingsInput = document.getElementById('import-settings-input') as HTMLInputElement;


// --- State ---
let textItemsWithBounds: any[] = [];
let textStyles: any = {};
let pageViewport: any = null;
let selectedItemIndex: number | null = null;
let lastRenderedLines: TextLine[] = [];
let controlState = {
  renditionMode: 'automatic',
  showItemBoxes: true,
  horizontalTolerance: 10,
  verticalProximity: 10,
  showBlockBoxes: true,
  yAxisTolerance: 5,
  showLabelValueBoxes: true,
  titleRatio: 2.0,
  showTitles: true,
};

// Configure the worker source for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

// --- Event Listeners ---
fileInput.addEventListener('change', handleFileSelect);
canvas.addEventListener('click', handleCanvasClick);

// Rendition Mode
renditionModeAuto.addEventListener('change', updateRenditionMode);
renditionModeManual.addEventListener('change', updateRenditionMode);

// Vertical Block Grouping Controls
horizontalToleranceSlider.addEventListener('input', (e) => {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    horizontalToleranceValue.textContent = String(value);
    controlState.horizontalTolerance = value;
    drawReconstruction();
});
verticalProximitySlider.addEventListener('input', (e) => {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    verticalProximityValue.textContent = String(value);
    controlState.verticalProximity = value;
    drawReconstruction();
});

// Label-Value Grouping Controls
yAxisToleranceSlider.addEventListener('input', (e) => {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    yAxisToleranceValue.textContent = String(value);
    controlState.yAxisTolerance = value;
    drawReconstruction();
});

// Title Detection Controls
titleRatioSlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    titleRatioValue.textContent = value.toFixed(1);
    controlState.titleRatio = value;
    drawReconstruction();
});


// Visualization Toggles
showItemBoxesCheckbox.addEventListener('change', (e) => {
    controlState.showItemBoxes = (e.target as HTMLInputElement).checked;
    drawReconstruction();
});
showBlockBoxesCheckbox.addEventListener('change', (e) => {
    controlState.showBlockBoxes = (e.target as HTMLInputElement).checked;
    drawReconstruction();
});
showLabelValueBoxesCheckbox.addEventListener('change', (e) => {
    controlState.showLabelValueBoxes = (e.target as HTMLInputElement).checked;
    drawReconstruction();
});
showTitlesCheckbox.addEventListener('change', (e) => {
    controlState.showTitles = (e.target as HTMLInputElement).checked;
    drawReconstruction();
});


// Group Details Toggle
toggleGroupDetailsLink.addEventListener('click', (e) => {
    e.preventDefault();
    const isHidden = groupDetailsContainer.hidden;
    groupDetailsContainer.hidden = !isHidden;
    toggleGroupDetailsLink.textContent = isHidden ? 'Show Group Details' : 'Hide Group Details';
});

// Import / Export
exportSettingsBtn.addEventListener('click', handleExport);
importSettingsInput.addEventListener('change', handleImport);

// Expand/Collapse Text Panel
expandTextBtn.addEventListener('click', () => {
    const isExpanded = analysisPanel.classList.contains('expanded');
    if (isExpanded) {
        analysisPanel.classList.remove('expanded');
        canvasContainer.classList.remove('hidden-by-expand');
        controlPanel.classList.remove('hidden-by-expand');
        expandTextBtn.textContent = 'Expand';
    } else {
        analysisPanel.classList.add('expanded');
        canvasContainer.classList.add('hidden-by-expand');
        controlPanel.classList.add('hidden-by-expand');
        expandTextBtn.textContent = 'Collapse';
    }
});

// Gemini Analysis
geminiAnalyzeBtn.addEventListener('click', handleAnalyzeWithGemini);
geminiDialogCloseBtn.addEventListener('click', () => geminiDialogOverlay.classList.remove('is-visible'));
geminiDialogOverlay.addEventListener('click', (e) => {
  if (e.target === geminiDialogOverlay) {
    geminiDialogOverlay.classList.remove('is-visible');
  }
});


// --- Main Functions ---

function getRandomColor() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `rgba(${r}, ${g}, ${b}, 0.4)`; // Low opacity for visual guidance
}

async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) return;

  showLoading(true);
  contentWrapper.style.visibility = 'hidden';
  
  try {
    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      const typedarray = new Uint8Array(e.target!.result as ArrayBuffer);
      await processPdf(typedarray);
      drawReconstruction(); // Initial draw
      contentWrapper.style.visibility = 'visible';
      showLoading(false);
    };
    fileReader.readAsArrayBuffer(file);
  } catch (error) {
    console.error('Error processing PDF:', error);
    alert('Failed to process the PDF.');
    showLoading(false);
  }
}

async function processPdf(pdfData: Uint8Array) {
  const pdf = await pdfjsLib.getDocument(pdfData).promise;
  const page = await pdf.getPage(1);
  pageViewport = page.getViewport({ scale: 1.5 });

  // Set canvas dimensions
  canvas.width = pageViewport.width;
  canvas.height = pageViewport.height;
  
  const textContent = await page.getTextContent();
  textStyles = textContent.styles;

  // Sanitize data by filtering out empty/whitespace-only items
  const filteredItems = textContent.items.filter((item: any) => item.str.trim() !== '');

  // Pre-calculate bounding boxes for all meaningful items
  textItemsWithBounds = filteredItems.map((item: any) => {
      const bounds = calculateBounds(item, pageViewport.transform);
      return { ...item, bounds };
  });

  // Reset selection
  selectedItemIndex = null;
}

function handleCanvasClick(event: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    // Scale click coordinates to match the canvas's internal resolution,
    // which might be different from its display size.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    let clickedItemIndex: number | null = null;
    // Iterate backwards to find the topmost item if they overlap
    for (let i = textItemsWithBounds.length - 1; i >= 0; i--) {
        const item = textItemsWithBounds[i];
        const { minX, minY, width, height } = item.bounds;
        if (x >= minX && x <= minX + width && y >= minY && y <= minY + height) {
            clickedItemIndex = i;
            break;
        }
    }
    selectedItemIndex = clickedItemIndex;
    drawReconstruction();
}


function drawReconstruction() {
    if (!pageViewport || textItemsWithBounds.length === 0) return;

    // Clear the main canvas
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Always draw text and (conditionally) item boxes
    for (let i = 0; i < textItemsWithBounds.length; i++) {
        const item = textItemsWithBounds[i];
        drawTextItem(item, context);
        if (controlState.showItemBoxes) {
            drawItemBox(item, context);
        }
        // Highlight selected item on main canvas
        if (i === selectedItemIndex) {
            drawGroupBox(item.bounds, 'rgba(255, 0, 0, 1)', 2, context);
        }
    }
    
    // If an item is selected, draw the analysis visuals
    if (selectedItemIndex !== null) {
        drawAnalysisVisuals(selectedItemIndex);
    }
    
    let debugLog = '';

    // --- Step 1: Vertical Block Grouping ---
    const blocks = groupIntoVerticalBlocks(textItemsWithBounds, controlState.horizontalTolerance, controlState.verticalProximity);
    if (blocks.length > 0) {
        debugLog += `--- Vertical Blocks (${blocks.length}) ---\n`;
        blocks.forEach((block, index) => {
            const groupBox = calculateGroupBox(block);
            if (controlState.showBlockBoxes) {
                drawGroupBox(groupBox, 'rgba(255, 165, 0, 0.5)', 2, context); // Orange
            }
            debugLog += `Block ${index + 1}: x:${groupBox.minX.toFixed(2)}, y:${groupBox.minY.toFixed(2)}, w:${groupBox.width.toFixed(2)}, h:${groupBox.height.toFixed(2)}\n`;
            block.forEach((member, memberIndex) => {
                debugLog += `  ${memberIndex}: "${member.str}"\n`;
            });
        });
        debugLog += '\n';
    }

    // --- Step 2: Consolidate items for Label-Value pairing ---
    const consolidatedItems: any[] = [];
    const itemsInBlocks = new Set(blocks.flat());

    // Add consolidated blocks as single items
    for (const block of blocks) {
        const groupBox = calculateGroupBox(block);
        const combinedStr = block.map(item => item.str).join(' ');
        consolidatedItems.push({
            str: combinedStr,
            bounds: groupBox,
            members: block,
        });
    }

    // Add remaining single items that were not part of any block
    for (const item of textItemsWithBounds) {
        if (!itemsInBlocks.has(item)) {
            consolidatedItems.push(item);
        }
    }
    
    // Sort consolidated items by Y then X for consistent processing
    consolidatedItems.sort((a, b) => {
        if (a.bounds.minY < b.bounds.minY) return -1;
        if (a.bounds.minY > b.bounds.minY) return 1;
        if (a.bounds.minX < b.bounds.minX) return -1;
        if (a.bounds.minX > b.bounds.minX) return 1;
        return 0;
    });

    // --- Step 3: Label-Value Pairs Logic using consolidated items ---
    const pairs = groupLabelValuePairs(consolidatedItems, controlState.yAxisTolerance);
    if (pairs.length > 0) {
        debugLog += `--- Label-Value Pairs (${pairs.length}) ---\n`;
        pairs.forEach((pair, index) => {
            const groupBox = calculateGroupBox(pair);
            if (controlState.showLabelValueBoxes) {
                drawGroupBox(groupBox, 'rgba(128, 0, 128, 0.5)', 2, context); // Purple
            }
            debugLog += `Pair ${index + 1}: [L: "${pair[0].str}", V: "${pair[1].str}"]\n`;
        });
        debugLog += '\n';
    }

    // --- Step 4: Title Detection ---
    const usedInPairs = new Set(pairs.flat());
    const remainingItems = consolidatedItems.filter(item => !usedInPairs.has(item));
    
    // Calculate median font size from original items
    const allHeights = textItemsWithBounds.map(item => item.bounds.height);
    const medianHeight = calculateMedian(allHeights);

    const titles = remainingItems.filter(item => {
        const representativeHeight = item.members ? item.members[0].bounds.height : item.bounds.height;
        return representativeHeight > (medianHeight * controlState.titleRatio);
    });

    if (titles.length > 0) {
        debugLog += `--- Titles (${titles.length}) ---\n`;
        titles.forEach((title, index) => {
            if (controlState.showTitles) {
                drawGroupBox(title.bounds, 'rgba(0, 128, 0, 0.5)', 2, context); // Green
            }
            const representativeHeight = title.members ? title.members[0].bounds.height : title.bounds.height;
            debugLog += `Title ${index + 1}: "${title.str}" (Font Height: ${representativeHeight.toFixed(2)}, Median: ${medianHeight.toFixed(2)})\n`;
        });
    }

    groupDetailsOutputEl.textContent = debugLog || 'No groups formed.';

    // --- Step 5: Update the plain text rendition ---
    if (controlState.renditionMode === 'automatic') {
        updatePlainTextRenditionAutomatic(textItemsWithBounds);
    } else {
        updatePlainTextRenditionManual(consolidatedItems);
    }
}


// --- Drawing and Calculation Helpers ---

function drawTextItem(item: any, ctx: CanvasRenderingContext2D) {
    const vpt = pageViewport.transform;
    const it = [...item.transform];
    it[2] = -it[2]; it[3] = -it[3];
    const a = vpt[0] * it[0] + vpt[2] * it[1], b = vpt[1] * it[0] + vpt[3] * it[1];
    const c = vpt[0] * it[2] + vpt[2] * it[3], d = vpt[1] * it[2] + vpt[3] * it[3];
    const e = vpt[0] * it[4] + vpt[2] * it[5] + vpt[4], f = vpt[1] * it[4] + vpt[3] * it[5] + vpt[5];
    
    ctx.setTransform(a, b, c, d, e, f);
    const font = textStyles[item.fontName];
    const fontFamily = font?.fontFamily || 'sans-serif';
    ctx.font = `1px ${fontFamily}`;
    ctx.fillStyle = '#333';
    ctx.fillText(item.str, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
}

function drawItemBox(item: any, ctx: CanvasRenderingContext2D) {
    const { minX, minY, width, height } = item.bounds;
    ctx.strokeStyle = getRandomColor();
    ctx.lineWidth = 1;
    ctx.strokeRect(minX, minY, width, height);
}

function calculateGroupBox(items: any[]) {
    if (items.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

    const allX: number[] = [];
    const allY: number[] = [];

    // Collect all corner coordinates from all items in the group
    for (const item of items) {
        allX.push(item.bounds.minX, item.bounds.maxX);
        allY.push(item.bounds.minY, item.bounds.maxY);
    }

    // Find the min and max of each list
    const minX = Math.min(...allX);
    const minY = Math.min(...allY);
    const maxX = Math.max(...allX);
    const maxY = Math.max(...allY);

    const width = maxX - minX;
    const height = maxY - minY;

    return { minX, minY, maxX, maxY, width, height };
}

function drawGroupBox(box: { minX: number, minY: number, width: number, height: number }, color: string, lineWidth = 2, ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(box.minX, box.minY, box.width, box.height);
}

function calculateBounds(item: any, viewportTransform: number[]) {
    const vpt = viewportTransform;
    const it = [...item.transform];
    it[2] = -it[2]; it[3] = -it[3];
    const a = vpt[0] * it[0] + vpt[2] * it[1], b = vpt[1] * it[0] + vpt[3] * it[1];
    const c = vpt[0] * it[2] + vpt[2] * it[3], d = vpt[1] * it[2] + vpt[3] * it[3];
    const e = vpt[0] * it[4] + vpt[2] * it[5] + vpt[4], f = vpt[1] * it[4] + vpt[3] * it[5] + vpt[5];
    const finalTransform = [a, b, c, d, e, f];

    const localHeight = 1;
    const localWidth = item.width / item.transform[0];

    const transformPoint = (m: number[], p: {x: number, y: number}) => ({
        x: m[0] * p.x + m[2] * p.y + m[4],
        y: m[1] * p.x + m[3] * p.y + m[5]
    });

    const p1 = transformPoint(finalTransform, { x: 0, y: 0 }); 
    const p2 = transformPoint(finalTransform, { x: localWidth, y: 0 });
    const p3 = transformPoint(finalTransform, { x: localWidth, y: -localHeight });
    const p4 = transformPoint(finalTransform, { x: 0, y: -localHeight });

    const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
    const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
    const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
    const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);
    
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function groupIntoVerticalBlocks(items: any[], xThreshold: number, yThreshold: number): any[][] {
    if (items.length === 0) return [];

    const sortedItems = [...items].sort((a, b) => a.bounds.minY - b.bounds.minY);
    const processedIndices = new Set<number>();
    const blocks: any[][] = [];

    for (let i = 0; i < sortedItems.length; i++) {
        if (processedIndices.has(i)) {
            continue;
        }

        const currentBlock = [sortedItems[i]];
        processedIndices.add(i);
        let lastInBlock = sortedItems[i];

        let searching = true;
        while (searching) {
            let bestCandidateIndex = -1;
            let minDistance = Infinity;

            // Search for the next item in the block
            for (let j = i + 1; j < sortedItems.length; j++) {
                if (processedIndices.has(j)) {
                    continue;
                }

                const candidate = sortedItems[j];
                const prevItem = lastInBlock;

                const yDist = candidate.bounds.minY - prevItem.bounds.maxY;
                if (yDist < 0 || yDist > yThreshold) continue;
                
                const xDist = Math.abs(prevItem.bounds.minX - candidate.bounds.minX);

                if (xDist <= xThreshold) {
                    if (yDist < minDistance) {
                        minDistance = yDist;
                        bestCandidateIndex = j;
                    }
                }
            }

            if (bestCandidateIndex !== -1) {
                const foundItem = sortedItems[bestCandidateIndex];
                currentBlock.push(foundItem);
                processedIndices.add(bestCandidateIndex);
                lastInBlock = foundItem;
            } else {
                searching = false; // No more items for this block
            }
        }
        
        if (currentBlock.length > 1) {
            blocks.push(currentBlock);
        }
    }
    return blocks;
}

function groupLabelValuePairs(items: any[], yTolerance: number): any[][] {
    const pairs: any[][] = [];
    const labels = items.filter(item => item.str.trim().endsWith(':'));
    const usedValues = new Set();

    for (const label of labels) {
        let bestCandidate: any = null;
        let minXDistance = Infinity;

        for (const value of items) {
            if (value === label || usedValues.has(value)) continue; 

            // Value must be to the right of the label
            if (value.bounds.minX > label.bounds.maxX) {
                const yDist = Math.abs(label.bounds.minY - value.bounds.minY);

                if (yDist <= yTolerance) {
                    const xDist = value.bounds.minX - label.bounds.maxX;
                    if (xDist < minXDistance) {
                        minXDistance = xDist;
                        bestCandidate = value;
                    }
                }
            }
        }

        if (bestCandidate) {
            pairs.push([label, bestCandidate]);
            usedValues.add(bestCandidate); // Ensure a value is only used once
        }
    }
    return pairs;
}

function calculateMedian(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}

// --- Analysis Visuals ---
function drawAnalysisVisuals(selectedIndex: number) {
    const selectedItem = textItemsWithBounds[selectedIndex];
    if (!selectedItem) return;

    const allHeights = textItemsWithBounds.map(item => item.bounds.height);
    const medianHeight = calculateMedian(allHeights);
    const maxVerticalSearch = medianHeight * 10;
    
    // --- Determine the "chosen" successor using the line-building logic ---
    let chosenSuccessor = null;
    const lines = buildLines(textItemsWithBounds);
    for (const line of lines) {
        const itemIndexInLine = line.indexOf(selectedItem);
        if (itemIndexInLine > -1 && itemIndexInLine < line.length - 1) {
            chosenSuccessor = line[itemIndexInLine + 1];
            break;
        }
    }

    // --- Define Search Zones ---
    const zones = {
        top: { x: selectedItem.bounds.minX, y: selectedItem.bounds.minY - maxVerticalSearch, width: selectedItem.bounds.width, height: maxVerticalSearch },
        bottom: { x: selectedItem.bounds.minX, y: selectedItem.bounds.maxY, width: selectedItem.bounds.width, height: maxVerticalSearch },
        left: { x: 0, y: selectedItem.bounds.minY, width: selectedItem.bounds.minX, height: selectedItem.bounds.height },
        right: { x: selectedItem.bounds.maxX, y: selectedItem.bounds.minY, width: canvas.width - selectedItem.bounds.maxX, height: selectedItem.bounds.height },
    };

    // --- Find and highlight candidates ---
    const candidates = new Set();
    for (const item of textItemsWithBounds) {
        if (item === selectedItem) continue;

        const itemBounds = item.bounds;
        // Check intersection with any zone
        const intersects = (zone: any) => 
            itemBounds.minX < zone.x + zone.width &&
            itemBounds.maxX > zone.x &&
            itemBounds.minY < zone.y + zone.height &&
            itemBounds.maxY > zone.y;
        
        if (intersects(zones.top) || intersects(zones.bottom) || intersects(zones.left) || intersects(zones.right)) {
            candidates.add(item);
        }
    }

    // --- Draw everything ---
    context.save();
    context.fillStyle = 'rgba(0, 100, 255, 0.2)'; // Blue for search zones
    Object.values(zones).forEach(zone => context.fillRect(zone.x, zone.y, zone.width, zone.height));

    // Draw orange boxes for all candidates
    candidates.forEach(item => {
        if (item !== chosenSuccessor) {
             drawGroupBox((item as any).bounds, 'rgba(255, 165, 0, 1)', 2, context); // Orange
        }
    });

    // Draw green box for the chosen successor
    if (chosenSuccessor) {
        drawGroupBox(chosenSuccessor.bounds, 'rgba(0, 200, 0, 1)', 3, context); // Green
    }
    context.restore();
}


// --- Text Rendition Engine ---

interface TextCell {
    text: string;
    col: number;
}
type TextLine = TextCell[];

/**
 * Renders the reconstructed text lines onto a dedicated canvas,
 * simulating a monospace text editor grid.
 */
function drawTextOutputToCanvas(lines: TextLine[], warningMessage: string) {
    lastRenderedLines = lines; // Store for Gemini analysis
    const ctx = textOutputCanvas.getContext('2d');
    if (!ctx) return;

    const fontSize = 12;
    const fontFamily = 'monospace';
    const font = `${fontSize}px ${fontFamily}`;
    ctx.font = font;

    const charWidth = ctx.measureText('M').width;
    const lineHeight = fontSize * 1.4;
    const warningLineCount = warningMessage ? warningMessage.trim().split('\n').length : 0;
    
    let maxCols = 0;
    for (const line of lines) {
        if (line.length > 0) {
            const lastCell = line[line.length - 1];
            const lineEndCol = lastCell.col + lastCell.text.length;
            if (lineEndCol > maxCols) maxCols = lineEndCol;
        }
    }

    const canvasWidth = Math.max(1, maxCols * charWidth + 10); // Add padding
    const canvasHeight = Math.max(1, (lines.length + warningLineCount) * lineHeight);

    textOutputCanvas.width = canvasWidth;
    textOutputCanvas.height = canvasHeight;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.font = font;
    ctx.fillStyle = '#333333';
    let currentY = lineHeight * 0.8; // Start drawing text not at the very top edge

    if (warningMessage) {
        ctx.save();
        ctx.fillStyle = '#d9534f';
        const warningLines = warningMessage.trim().split('\n');
        for (const line of warningLines) {
             ctx.fillText(line, 5, currentY);
             currentY += lineHeight;
        }
        ctx.restore();
    }

    for (const line of lines) {
        for (const cell of line) {
            ctx.fillText(cell.text, cell.col * charWidth, currentY);
        }
        currentY += lineHeight;
    }
}


/**
 * Builds lines from text items using a robust "vertical overlap" approach.
 * This is the first step in the automatic rendition pipeline.
 */
function buildLines(allItems: any[]): any[][] {
    if (allItems.length === 0) return [];

    const sortedItems = [...allItems].sort((a, b) => {
        if (a.bounds.minY < b.bounds.minY) return -1;
        if (a.bounds.minY > b.bounds.minY) return 1;
        if (a.bounds.minX < b.bounds.minX) return -1;
        if (a.bounds.minX > b.bounds.minX) return 1;
        return 0;
    });

    const lines: any[][] = [];
    const assignedItemSet = new Set<any>();

    for (const startItem of sortedItems) {
        if (assignedItemSet.has(startItem)) {
            continue;
        }

        const itemsInRow = sortedItems.filter(item => {
            if (assignedItemSet.has(item)) return false;
            // An item is in the row if its vertical bounds overlap with the startItem's.
            return item.bounds.minY < startItem.bounds.maxY && item.bounds.maxY > startItem.bounds.minY;
        });

        if (itemsInRow.length > 0) {
            const currentLine = itemsInRow.sort((a, b) => a.bounds.minX - b.bounds.minX);
            lines.push(currentLine);
            for (const item of currentLine) {
                assignedItemSet.add(item);
            }
        }
    }
    return lines;
}

/**
 * Finds all items that are valid vertical neighbors for a given item.
 * An item is a neighbor if it's within the downward search zone.
 */
function findDownwardNeighbors(sourceItem: any, allItems: any[], maxDistance: number): Set<any> {
    const neighbors = new Set<any>();
    for (const targetItem of allItems) {
        if (targetItem === sourceItem) continue;

        // Must be below the source item
        if (targetItem.bounds.minY > sourceItem.bounds.minY) {
            const verticalDistance = targetItem.bounds.minY - sourceItem.bounds.maxY;
            const isHorizontallyAligned = targetItem.bounds.minX < sourceItem.bounds.maxX && targetItem.bounds.maxX > sourceItem.bounds.minX;
            
            if (isHorizontallyAligned && verticalDistance >= 0 && verticalDistance < maxDistance) {
                neighbors.add(targetItem);
            }
        }
    }
    return neighbors;
}

/**
 * A helper function to ripple through a line and fix any horizontal overlaps.
 */
function fixIntraLineOverlaps(row: any[]) {
    for (let j = 0; j < row.length - 1; j++) {
        const currentCell = row[j];
        const nextCell = row[j + 1];
        const requiredStartForNext = currentCell.textEndCol + 1; // +1 for a space

        if (nextCell.startCol < requiredStartForNext) {
            const pushAmount = requiredStartForNext - nextCell.startCol;
            // Push the next cell and everything after it
            for (let k = j + 1; k < row.length; k++) {
                row[k].startCol += pushAmount;
                row[k].physicalEndCol += pushAmount;
            }
        }
    }
}


function updatePlainTextRenditionAutomatic(allItems: any[]) {
    if (allItems.length === 0) {
        drawTextOutputToCanvas([], '');
        return;
    }
    
    // --- Step 1: Calculate Metrics and Relationships ---
    let totalWidth = 0;
    let totalChars = 0;
    const allHeights: number[] = [];
    for (const item of allItems) {
        const trimmedStr = item.str.trim();
        if (trimmedStr.length > 0) {
            totalWidth += item.bounds.width;
            totalChars += trimmedStr.length;
        }
        allHeights.push(item.bounds.height);
    }
    const avgCharWidth = totalChars > 0 ? totalWidth / totalChars : 8;
    const medianHeight = calculateMedian(allHeights);
    const maxVerticalSearch = medianHeight * 10;

    const downwardNeighborsMap = new Map<any, Set<any>>();
    for (const item of allItems) {
        downwardNeighborsMap.set(item, findDownwardNeighbors(item, allItems, maxVerticalSearch));
    }

    // --- Step 2: Build initial lines ---
    const lines = buildLines(allItems);

    // --- Step 3: Iteratively adjust spacing ---
    const MAX_PASSES = 10;
    let passCount = 0;

    const placedLines = lines.map(line =>
        line.map(item => {
            const startCol = Math.round(item.bounds.minX / avgCharWidth);
            return {
                item,
                startCol: startCol,
                physicalEndCol: Math.round(item.bounds.maxX / avgCharWidth),
                get textEndCol() { return this.startCol + this.item.str.trim().length; }
            };
        })
    );

    // Initial horizontal cleanup pass to fix overlaps from coordinate conversion
    for (const line of placedLines) {
        fixIntraLineOverlaps(line);
    }
    
    for (passCount = 0; passCount < MAX_PASSES; passCount++) {
        let violationsFoundInPass = false;
        for (let i = 0; i < placedLines.length - 1; i++) {
            const topRow = placedLines[i];
            const bottomRow = placedLines[i + 1];

            const shifts = new Array(bottomRow.length).fill(0);
            let rowNeedsAdjustment = false;

            for (const topCell of topRow) {
                const validNeighbors = downwardNeighborsMap.get(topCell.item);
                if (!validNeighbors) continue;

                for (let j = 0; j < bottomRow.length; j++) {
                    const bottomCell = bottomRow[j];
                    const isValidNeighbor = validNeighbors.has(bottomCell.item);

                    // A violation occurs if the bottom cell STARTS within the top cell's horizontal span,
                    // but they are not supposed to be vertically aligned. This is more specific than a simple overlap.
                    const bottomStartsInTop = bottomCell.startCol >= topCell.startCol && bottomCell.startCol <= topCell.physicalEndCol;

                    if (bottomStartsInTop && !isValidNeighbor) {
                        const pushAmount = (topCell.textEndCol + 1 - bottomCell.startCol);
                        if (pushAmount > 0) {
                            shifts[j] = Math.max(shifts[j], pushAmount);
                            rowNeedsAdjustment = true;
                        }
                    }
                }
            }

            if (rowNeedsAdjustment) {
                violationsFoundInPass = true;
                // Phase 2a: Apply the direct vertical-alignment shifts
                for (let j = 0; j < bottomRow.length; j++) {
                    if (shifts[j] > 0) {
                        bottomRow[j].startCol += shifts[j];
                        bottomRow[j].physicalEndCol += shifts[j];
                    }
                }
                // Phase 2b: Fix any new horizontal overlaps caused by the shift
                fixIntraLineOverlaps(bottomRow);
            }
        }
        if (!violationsFoundInPass) {
            break; // Layout has stabilized
        }
    }
    
    // --- Step 4: Generate Final Renderable Output ---
    const finalRenderableLines: TextLine[] = [];
    let lastLineY = lines.length > 0 && lines[0].length > 0 ? lines[0][0].bounds.minY : 0;
    
    for (let i = 0; i < placedLines.length; i++) {
        const lineItems = lines[i];
        if (lineItems.length === 0) {
            finalRenderableLines.push([]);
            continue;
        };

        const currentLineY = lineItems[0].bounds.minY;
        const lineJump = Math.round((currentLineY - lastLineY) / medianHeight);
        if (lineJump > 1) {
            for(let j = 0; j < lineJump - 1; j++) {
                finalRenderableLines.push([]);
            }
        }

        const placedLine = placedLines[i];
        const renderableLine: TextLine = placedLine.map(cell => ({
            text: cell.item.str,
            col: cell.startCol,
        }));
        finalRenderableLines.push(renderableLine);
        lastLineY = currentLineY;
    }

    const warningMessage = passCount >= MAX_PASSES ? "[Warning: Text reconstruction reached max iterations. Layout may be imperfect.]\n" : "";
    drawTextOutputToCanvas(finalRenderableLines, warningMessage);
}

// --- Manual Rendition ---
function updatePlainTextRenditionManual(consolidatedItems: any[]) {
    if (consolidatedItems.length === 0) {
        drawTextOutputToCanvas([], '');
        return;
    }
    let totalWidth = 0;
    let totalChars = 0;
    let totalLineHeight = 0;

    for (const item of textItemsWithBounds) {
        const trimmedStr = item.str.trim();
        if (trimmedStr.length > 0) {
            totalWidth += item.bounds.width;
            totalChars += trimmedStr.length;
        }
        totalLineHeight += item.bounds.height;
    }

    const avgCharWidth = totalChars > 0 ? totalWidth / totalChars : 8;
    const avgLineHeight = textItemsWithBounds.length > 0 ? totalLineHeight / textItemsWithBounds.length : 15;
    
    const sortedItems = consolidatedItems;
    const lines: any[][] = [];
    if (sortedItems.length > 0) {
        let currentLine = [sortedItems[0]];
        for (let i = 1; i < sortedItems.length; i++) {
            const prevItem = currentLine[currentLine.length - 1];
            const currentItem = sortedItems[i];
            
            const prevCenterY = prevItem.bounds.minY + prevItem.bounds.height / 2;
            const currentCenterY = currentItem.bounds.minY + currentItem.bounds.height / 2;
            
            if (Math.abs(currentCenterY - prevCenterY) < avgLineHeight / 2) {
                currentLine.push(currentItem);
            } else {
                lines.push(currentLine.sort((a, b) => a.bounds.minX - b.bounds.minX));
                currentLine = [currentItem];
            }
        }
        lines.push(currentLine.sort((a, b) => a.bounds.minX - b.bounds.minX));
    }
    
    // Convert lines to renderable format and draw on canvas
    const finalRenderableLines: TextLine[] = [];
    let lastLineY = lines.length > 0 && lines[0].length > 0 ? lines[0][0].bounds.minY : 0;
    
    for (const line of lines) {
        if (line.length === 0) {
            finalRenderableLines.push([]);
            continue;
        }
        const currentLineY = line[0].bounds.minY;
        const lineJump = Math.round((currentLineY - lastLineY) / avgLineHeight);
        if (lineJump > 1) {
            for (let i = 0; i < lineJump - 1; i++) {
                finalRenderableLines.push([]);
            }
        }
        
        const renderableLine: TextLine = line.map(item => ({
            text: item.str,
            col: Math.floor(item.bounds.minX / avgCharWidth)
        }));
        finalRenderableLines.push(renderableLine);
        lastLineY = currentLineY;
    }
    drawTextOutputToCanvas(finalRenderableLines, '');
}

// --- Gemini Analysis ---
function convertLinesToString(lines: TextLine[]): string {
    let result = '';
    for (const line of lines) {
        let currentLineStr = '';
        let lastCol = 0;
        const sortedLine = [...line].sort((a, b) => a.col - b.col);
        for (const cell of sortedLine) {
            const spaces = Math.max(0, cell.col - lastCol);
            currentLineStr += ' '.repeat(spaces) + cell.text;
            lastCol = cell.col + cell.text.length;
        }
        result += currentLineStr + '\n';
    }
    return result.trim();
}


async function handleAnalyzeWithGemini() {
    if (lastRenderedLines.length === 0) {
        alert('There is no text to analyze. Please upload a PDF first.');
        return;
    }

    geminiDialogContent.textContent = 'Analyzing...';
    geminiDialogOverlay.classList.add('is-visible');

    try {
        const textContent = convertLinesToString(lastRenderedLines);
        const prompt = `Extract this document data\n\n\`\`\`\n${textContent}\n\`\`\``;

        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        geminiDialogContent.textContent = response.text;

    } catch (error) {
        console.error('Gemini API call failed:', error);
        geminiDialogContent.textContent = `Error: Could not get a response from the API.\n\n${error.message || error}`;
    }
}


// --- Mode & Settings ---
function updateRenditionMode() {
    controlState.renditionMode = renditionModeAuto.checked ? 'automatic' : 'manual';
    manualControlsFieldset.disabled = controlState.renditionMode === 'automatic';
    drawReconstruction();
}

function handleExport() {
    try {
        const settingsString = JSON.stringify(controlState, null, 2);
        const blob = new Blob([settingsString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'reconstructor-settings.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Failed to export settings:", error);
        alert("Could not export settings.");
    }
}

function handleImport(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            const loadedState = JSON.parse(text);
            
            // Gracefully merge settings for backward compatibility
            const newState = { ...controlState };
            
            if (typeof loadedState.renditionMode === 'string') newState.renditionMode = loadedState.renditionMode;
            if (typeof loadedState.showItemBoxes === 'boolean') newState.showItemBoxes = loadedState.showItemBoxes;
            if (typeof loadedState.showBlockBoxes === 'boolean') newState.showBlockBoxes = loadedState.showBlockBoxes;
            if (typeof loadedState.showLabelValueBoxes === 'boolean') newState.showLabelValueBoxes = loadedState.showLabelValueBoxes;
            if (typeof loadedState.showTitles === 'boolean') newState.showTitles = loadedState.showTitles;
            if (typeof loadedState.horizontalTolerance === 'number') newState.horizontalTolerance = loadedState.horizontalTolerance;
            if (typeof loadedState.verticalProximity === 'number') newState.verticalProximity = loadedState.verticalProximity;
            if (typeof loadedState.yAxisTolerance === 'number') newState.yAxisTolerance = loadedState.yAxisTolerance;
            if (typeof loadedState.titleRatio === 'number') newState.titleRatio = loadedState.titleRatio;

            controlState = newState;

            // Update UI elements from the new state
            renditionModeAuto.checked = controlState.renditionMode === 'automatic';
            renditionModeManual.checked = controlState.renditionMode === 'manual';
            manualControlsFieldset.disabled = controlState.renditionMode === 'automatic';
            
            showItemBoxesCheckbox.checked = controlState.showItemBoxes;
            showBlockBoxesCheckbox.checked = controlState.showBlockBoxes;
            showLabelValueBoxesCheckbox.checked = controlState.showLabelValueBoxes;
            showTitlesCheckbox.checked = controlState.showTitles;
            horizontalToleranceSlider.value = String(controlState.horizontalTolerance);
            horizontalToleranceValue.textContent = String(controlState.horizontalTolerance);
            verticalProximitySlider.value = String(controlState.verticalProximity);
            verticalProximityValue.textContent = String(controlState.verticalProximity);
            yAxisToleranceSlider.value = String(controlState.yAxisTolerance);
            yAxisToleranceValue.textContent = String(controlState.yAxisTolerance);
            titleRatioSlider.value = String(controlState.titleRatio);
            titleRatioValue.textContent = String(controlState.titleRatio.toFixed(1));

            drawReconstruction(); // Redraw with new settings
            alert("Settings imported successfully!");

        } catch (error) {
            console.error("Failed to import settings:", error);
            alert("Could not import settings. Please check the file format.");
        } finally {
            // Reset the input so the same file can be loaded again
            (event.target as HTMLInputElement).value = '';
        }
    };
    reader.readAsText(file);
}


function showLoading(show: boolean) {
  loadingIndicator.hidden = !show;
}