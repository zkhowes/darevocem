import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

interface ContextMenuProps {
  visible: boolean;
  onClose: () => void;
  onKeyboard: () => void;
  onSave: () => void;
  onMic?: () => void;
  onCamera?: () => void;
  variant?: 'default' | 'phrase';
  onSpeakImperfect?: () => void;
}

export function ContextMenu({
  visible,
  onClose,
  onKeyboard,
  onSave,
  onMic,
  onCamera,
  variant = 'default',
  onSpeakImperfect,
}: ContextMenuProps) {
  const options = variant === 'phrase'
    ? [
        { label: 'Speak even though not quite right', onPress: onSpeakImperfect },
        { label: 'Save phrase', onPress: onSave },
      ]
    : [
        { label: 'Keyboard', onPress: onKeyboard },
        { label: 'Camera', onPress: onCamera },
        { label: 'Microphone', onPress: onMic },
        { label: 'Save', onPress: onSave },
      ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.menu}>
          {options.map((opt) => (
            <Pressable
              key={opt.label}
              style={styles.option}
              onPress={() => { opt.onPress?.(); onClose(); }}
            >
              <Text style={styles.optionText}>{opt.label}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.option, styles.cancel]} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  menu: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  option: {
    minHeight: LAYOUT.listItemHeight,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0EC',
  },
  optionText: { fontSize: TYPOGRAPHY.listItem.size, fontWeight: '500', color: '#1A1A1A' },
  cancel: { borderBottomWidth: 0, marginTop: 8 },
  cancelText: { fontSize: TYPOGRAPHY.listItem.size, fontWeight: '500', color: '#C0392B' },
});
