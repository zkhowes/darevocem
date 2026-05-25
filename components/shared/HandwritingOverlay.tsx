import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Dimensions,
} from 'react-native';
import {
  Canvas,
  Path,
  Rect,
  Skia,
  useCanvasRef,
  type SkPath,
} from '@shopify/react-native-skia';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { LAYOUT } from '../../constants/config';
import { recognizeWord, recognizeDrawing } from '../../services/handwriting';

declare const __DEV__: boolean;

// Whole-word handwriting canvas. Two modes:
//   - Word mode (default): user writes the entire word on the canvas, then
//     taps Accept. One Claude vision call reads it and returns the word.
//   - Drawing mode (toggle): user sketches a concept (flower, dog, heart).
//     Same flow but Claude treats the image as a pictogram and returns the
//     concept word + a contextual completion.
//
// No per-letter recognition: VNRecognizeTextRequest returns empty for
// isolated finger-drawn glyphs, and one Claude call per letter is too slow.

const STROKE_WIDTH = 6;
const STROKE_COLOR = '#1A1A1A';

interface HandwritingOverlayProps {
  visible: boolean;
  /** Called with the recognized word when the user taps Accept. */
  onAccept: (word: string) => void;
  /** Called when the user dismisses without accepting. */
  onCancel: () => void;
  /** Optional context passed to drawing-mode interpretation. */
  composeContext?: { intent?: string | null; fullPhrase?: string };
}

interface StrokeRecord {
  path: SkPath;
}

export function HandwritingOverlay({
  visible,
  onAccept,
  onCancel,
  composeContext,
}: HandwritingOverlayProps) {
  // Committed strokes that make up the whole word/drawing.
  const [strokes, setStrokes] = useState<StrokeRecord[]>([]);

  // Active in-progress stroke being drawn right now.
  const [activeStroke, setActiveStroke] = useState<SkPath | null>(null);

  // Drawing mode: when on, Accept runs the sketch through Claude as a
  // pictogram and returns the concept word.
  const [drawingMode, setDrawingMode] = useState(false);

  const [isRecognizing, setIsRecognizing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const canvasRef = useCanvasRef();

  // Reset state every time the overlay opens.
  useEffect(() => {
    if (visible) {
      setStrokes([]);
      setActiveStroke(null);
      setDrawingMode(false);
      setIsRecognizing(false);
      setHint(null);
    }
  }, [visible]);

  // Gesture: build up an SkPath as the finger moves. On end, push it into
  // the strokes list. No commit timer — strokes accumulate until Accept.
  const panGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      const p = Skia.Path.Make();
      p.moveTo(e.x, e.y);
      setActiveStroke(p);
    })
    .onUpdate((e) => {
      setActiveStroke((current) => {
        if (!current) return current;
        // SkPath is mutable — lineTo mutates in place. We return a copy so
        // React re-renders.
        current.lineTo(e.x, e.y);
        return current.copy();
      });
    })
    .onEnd(() => {
      setActiveStroke((current) => {
        if (current) {
          setStrokes((prev) => [...prev, { path: current }]);
        }
        return null;
      });
    })
    .runOnJS(true);

  // Clear: erase everything on the canvas so the user can start over.
  const handleClear = useCallback(() => {
    setStrokes([]);
    setActiveStroke(null);
    setHint(null);
  }, []);

  // Accept: snapshot the canvas, run it through Claude (word or drawing
  // mode), call onAccept with the result. On failure, keep strokes so the
  // user can try again. Hard outer timeout — the spinner MUST clear within
  // 12s no matter what (services have their own 10s AbortController, this
  // is a final belt-and-braces guard).
  const handleAccept = useCallback(async () => {
    if (isRecognizing) return;
    if (strokes.length === 0 && !activeStroke) return;
    if (!canvasRef.current) return;

    setIsRecognizing(true);
    setHint(null);

    const safetyTimeout = setTimeout(() => {
      if (__DEV__) console.log('[handwriting] safety timeout fired — clearing spinner');
      setHint("couldn't read — try again");
      setIsRecognizing(false);
    }, 12000);

    try {
      const image = canvasRef.current.makeImageSnapshot();
      const base64 = image.encodeToBase64();
      if (__DEV__) console.log(`[handwriting] snapshot bytes: ${base64.length}`);

      if (drawingMode) {
        const result = await recognizeDrawing(base64, composeContext);
        clearTimeout(safetyTimeout);
        if (result.literal && result.literal !== 'something') {
          onAccept(result.literal);
        } else {
          setHint("couldn't read the drawing — try again");
          setIsRecognizing(false);
        }
      } else {
        const word = await recognizeWord(base64);
        clearTimeout(safetyTimeout);
        if (word && word.length > 0) {
          onAccept(word);
        } else {
          setHint("couldn't read — try again");
          setIsRecognizing(false);
        }
      }
    } catch (err) {
      clearTimeout(safetyTimeout);
      if (__DEV__) console.log('[handwriting] accept error:', err);
      // Distinguish "signed out" from "unreadable" so the user knows it's an
      // auth problem, not their handwriting.
      const signedOut = (err as Error)?.name === 'NotSignedInError';
      setHint(signedOut ? 'Please sign in again' : "couldn't read — try again");
      setIsRecognizing(false);
    }
  }, [activeStroke, canvasRef, composeContext, drawingMode, isRecognizing, onAccept, strokes.length]);

  // Canvas dimensions: nearly full width, generous height for word writing.
  const screenWidth = Dimensions.get('window').width;
  const canvasWidth = screenWidth - LAYOUT.screenPadding * 2;
  const canvasHeight = 420;

  const hasStrokes = strokes.length > 0 || activeStroke !== null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onCancel}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={12} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>
            {drawingMode ? 'Draw' : 'Write'}
          </Text>
          <View style={styles.modeToggle}>
            <Text style={styles.modeLabel}>Drawing</Text>
            <Switch
              value={drawingMode}
              onValueChange={(v) => {
                setDrawingMode(v);
                handleClear();
              }}
            />
          </View>
        </View>

        <View style={styles.hintRow}>
          <Text style={styles.hintText}>
            {drawingMode
              ? 'Draw what you want to say, then tap Accept'
              : 'Write a word, then tap Accept'}
          </Text>
        </View>

        {hint && (
          <View style={styles.hintBubble}>
            <Text style={styles.hintBubbleText}>{hint}</Text>
          </View>
        )}

        {/* Canvas. The Skia Canvas itself renders transparently; we paint a
            white Rect first so OCR sees dark strokes on a white background,
            not strokes on alpha. */}
        <View style={[styles.canvasFrame, { width: canvasWidth, height: canvasHeight }]}>
          <GestureDetector gesture={panGesture}>
            <Canvas ref={canvasRef} style={styles.canvas}>
              <Rect x={0} y={0} width={canvasWidth} height={canvasHeight} color="#FFFFFF" />
              {strokes.map((s, i) => (
                <Path key={i} path={s.path} color={STROKE_COLOR} style="stroke" strokeWidth={STROKE_WIDTH} strokeCap="round" strokeJoin="round" />
              ))}
              {activeStroke && (
                <Path path={activeStroke} color={STROKE_COLOR} style="stroke" strokeWidth={STROKE_WIDTH} strokeCap="round" strokeJoin="round" />
              )}
            </Canvas>
          </GestureDetector>
          {isRecognizing && (
            <View style={styles.recognizingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#E07B2E" />
            </View>
          )}
        </View>

        {/* Button row */}
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.clearButton, !hasStrokes && styles.actionButtonDisabled]}
            onPress={handleClear}
            disabled={!hasStrokes}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
          <Pressable
            style={[
              styles.acceptButton,
              (isRecognizing || !hasStrokes) && styles.acceptButtonDisabled,
            ]}
            onPress={handleAccept}
            disabled={isRecognizing || !hasStrokes}
          >
            <Text style={styles.acceptButtonText}>Accept</Text>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5F5F0',
    paddingTop: 60,
    paddingHorizontal: LAYOUT.screenPadding,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#C0392B',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: 2,
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B6B6B',
    letterSpacing: 0.5,
  },
  hintRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  hintText: {
    fontSize: 14,
    color: '#6B6B6B',
    fontStyle: 'italic',
  },
  hintBubble: {
    backgroundColor: '#FFF9E6',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#F39C12',
    marginBottom: 8,
  },
  hintBubbleText: {
    fontSize: 14,
    color: '#6B6B6B',
  },
  canvasFrame: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D0D0D0',
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: 20,
  },
  canvas: {
    flex: 1,
  },
  recognizingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 'auto',
    marginBottom: 40,
  },
  clearButton: {
    width: 100,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#D0D0D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B6B6B',
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  acceptButton: {
    flex: 1,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#27AE60',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonDisabled: {
    backgroundColor: '#B0B0B0',
  },
  acceptButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});
