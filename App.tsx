import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, TouchableOpacity, Alert, Platform, SafeAreaView } from 'react-native';
import SQLite from 'react-native-sqlite-storage';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import Icon from 'react-native-vector-icons/Ionicons';
import { format } from 'date-fns'; // 请确保安装了 date-fns 库：npm install date-fns

SQLite.enablePromise(true);

interface Note {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  audioUri?: string;
  createdAt: number;
  updatedAt: number;
  isSync: boolean;
  deviceId: string;
}

const App = () => {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [inputText, setInputText] = useState('');
  const [keywords, setKeywords] = useState('');
  const [recording, setRecording] = useState<AudioRecorderPlayer | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioRecorderPlayer] = useState(new AudioRecorderPlayer());

  const initDB = useCallback(async () => {
    try {
      const database = await SQLite.openDatabase({ name: 'NotesDB.db', location: 'default' });
      console.log('Database opened');
      setDb(database);
      
      await database.executeSql(
        'CREATE TABLE IF NOT EXISTS Notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, keywords TEXT, audioUri TEXT, createdAt INTEGER, updatedAt INTEGER, isSync INTEGER, deviceId TEXT)'
      );
      console.log('Table created or already exists');
    } catch (error) {
      console.error('Error initializing database:', error);
    }
  }, []);

  useEffect(() => {
    initDB();
  }, [initDB]);

  const loadNotes = useCallback(async () => {
    if (!db) {
      console.log('Database not ready');
      return;
    }
    try {
      const [results] = await db.executeSql('SELECT * FROM Notes ORDER BY updatedAt DESC');
      const loadedNotes: Note[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        const row = results.rows.item(i);
        loadedNotes.push({
          ...row,
          keywords: JSON.parse(row.keywords),
          isSync: Boolean(row.isSync),
        });
      }
      setNotes(loadedNotes);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  }, [db]);

  useEffect(() => {
    if (db) {
      loadNotes();
    }
  }, [db, loadNotes]);

  const checkPermission = async () => {
    if (Platform.OS === 'android') {
      const result = await check(PERMISSIONS.ANDROID.RECORD_AUDIO);
      if (result !== RESULTS.GRANTED) {
        await request(PERMISSIONS.ANDROID.RECORD_AUDIO);
      }
    } else if (Platform.OS === 'ios') {
      const result = await check(PERMISSIONS.IOS.MICROPHONE);
      if (result !== RESULTS.GRANTED) {
        await request(PERMISSIONS.IOS.MICROPHONE);
      }
    }
  };

  const startRecording = async () => {
    try {
      await checkPermission();
      const result = await audioRecorderPlayer.startRecorder();
      audioRecorderPlayer.addRecordBackListener((e) => {
        // 可以在这里处理录音状态更新
      });
      setIsRecording(true);
      setAudioUri(result);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = async () => {
    try {
      const result = await audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.removeRecordBackListener();
      setIsRecording(false);
      setAudioUri(result);
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };

  const playAudio = async (uri: string) => {
    try {
      await audioRecorderPlayer.startPlayer(uri);
      audioRecorderPlayer.addPlayBackListener((e) => {
        // 可以在这里处理播放状态更新
      });
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  const addNote = async () => {
    if (!db) {
      console.log('Database not ready');
      return;
    }
    if (inputText.trim() === '' && !audioUri) return;

    const processedKeywords = keywords
      .replace(/，/g, ',')
      .split(',')
      .map(k => k.trim())
      .filter(k => k !== '');

    const now = Date.now();
    const formattedDate = format(now, 'yyyy-MM-dd HH:mm:ss');

    const newNote: Omit<Note, 'id'> = {
      title: formattedDate, // 使用格式化的日期时间作为标题
      content: inputText,
      keywords: processedKeywords,
      audioUri: audioUri || undefined,
      createdAt: now,
      updatedAt: now,
      isSync: false,
      deviceId: 'unique_device_id',
    };

    try {
      await db.transaction(async (tx) => {
        await tx.executeSql(
          'INSERT INTO Notes (title, content, keywords, audioUri, createdAt, updatedAt, isSync, deviceId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [newNote.title, newNote.content, JSON.stringify(newNote.keywords), newNote.audioUri, newNote.createdAt, newNote.updatedAt, 0, newNote.deviceId]
        );
      });
      await loadNotes();
      setInputText('');
      setKeywords('');
      setAudioUri(null);
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  const deleteNote = async (id: string) => {
    if (!db) {
      console.log('Database not ready');
      return;
    }
    Alert.alert(
      "删除笔记",
      "您确定要删除这条笔记吗？",
      [
        {
          text: "取消",
          style: "cancel"
        },
        { 
          text: "确定", 
          onPress: async () => {
            try {
              await db.transaction(async (tx) => {
                await tx.executeSql('DELETE FROM Notes WHERE id = ?', [id]);
              });
              await loadNotes();
            } catch (error) {
              console.error('Error deleting note:', error);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: Note }) => (
    <View style={styles.noteItem}>
      <View style={styles.noteContent}>
        <Text style={styles.noteTitle}>{item.title}</Text>
        <Text style={styles.noteText}>{item.content}</Text>
        {item.audioUri && (
          <TouchableOpacity onPress={() => playAudio(item.audioUri!)} style={styles.playButton}>
            <Icon name="play" size={24} color="#4a90e2" />
          </TouchableOpacity>
        )}
        <Text style={styles.keywords}>关键词: {item.keywords.join('、')}</Text>
      </View>
      <TouchableOpacity onPress={() => deleteNote(item.id)} style={styles.deleteButton}>
        <Icon name="trash-outline" size={24} color="#e74c3c" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>我的笔记</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          multiline
          placeholder="输入笔记内容"
          value={inputText}
          onChangeText={setInputText}
        />
        <TouchableOpacity
          style={styles.micButton}
          onPress={isRecording ? stopRecording : startRecording}
        >
          <Icon
            name={isRecording ? "mic-off" : "mic"}
            size={24}
            color={isRecording ? "#e74c3c" : "#4a90e2"}
          />
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.keywordInput}
        placeholder="输入关键词，用逗号分隔（中英文逗号均可）"
        value={keywords}
        onChangeText={setKeywords}
      />
      <TouchableOpacity style={styles.addButton} onPress={addNote}>
        <Text style={styles.addButtonText}>添加笔记</Text>
      </TouchableOpacity>
      <FlatList
        data={notes}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        style={styles.noteList}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#2c3e50',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  input: {
    flex: 1,
    height: 100,
    padding: 10,
    fontSize: 16,
  },
  keywordInput: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  micButton: {
    padding: 10,
  },
  addButton: {
    backgroundColor: '#4a90e2',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  noteList: {
    flex: 1,
  },
  noteItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  noteContent: {
    flex: 1,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#2c3e50',
  },
  noteText: {
    fontSize: 14,
    color: '#34495e',
    marginBottom: 5,
  },
  keywords: {
    fontSize: 12,
    color: '#7f8c8d',
    fontStyle: 'italic',
  },
  playButton: {
    marginVertical: 5,
  },
  deleteButton: {
    padding: 10,
  },
});

export default App;
