import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc,
  setDoc,
  query,
  orderBy,
  where,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase.js';
import { authService } from './auth.js';

export class DatabaseService {
  constructor() {
    this.userId = null;
    
    // Listen to auth changes
    authService.onAuthStateChange((user) => {
      this.userId = user ? user.uid : null;
    });
  }

  // Get user's collection reference
  getUserCollection(collectionName) {
    if (!this.userId) throw new Error('User not authenticated');
    return collection(db, 'users', this.userId, collectionName);
  }

  // Get user's document reference
  getUserDoc(collectionName, docId) {
    if (!this.userId) throw new Error('User not authenticated');
    return doc(db, 'users', this.userId, collectionName, docId);
  }

  // ========== LESSONS ==========
  
  async createLesson(lessonData) {
    try {
      const lessonsRef = this.getUserCollection('lessons');
      const docRef = await addDoc(lessonsRef, {
        ...lessonData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { id: docRef.id, ...lessonData };
    } catch (error) {
      console.error('Error creating lesson:', error);
      throw error;
    }
  }

  async updateLesson(lessonId, lessonData) {
    try {
      const lessonRef = this.getUserDoc('lessons', lessonId);
      await updateDoc(lessonRef, {
        ...lessonData,
        updatedAt: serverTimestamp()
      });
      return { id: lessonId, ...lessonData };
    } catch (error) {
      console.error('Error updating lesson:', error);
      throw error;
    }
  }

  async deleteLesson(lessonId) {
    try {
      const lessonRef = this.getUserDoc('lessons', lessonId);
      await deleteDoc(lessonRef);
    } catch (error) {
      console.error('Error deleting lesson:', error);
      throw error;
    }
  }

  async getLessons() {
    try {
      const lessonsRef = this.getUserCollection('lessons');
      const q = query(lessonsRef, orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting lessons:', error);
      throw error;
    }
  }

  async getLesson(lessonId) {
    try {
      const lessonRef = this.getUserDoc('lessons', lessonId);
      const snapshot = await getDoc(lessonRef);
      if (snapshot.exists()) {
        return { id: snapshot.id, ...snapshot.data() };
      }
      return null;
    } catch (error) {
      console.error('Error getting lesson:', error);
      throw error;
    }
  }

  async getLessonsByDate(date) {
    try {
      const lessonsRef = this.getUserCollection('lessons');
      const q = query(lessonsRef, where('date', '==', date));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting lessons by date:', error);
      throw error;
    }
  }

  // ========== TEMPLATES ==========

  async createTemplate(templateData) {
    try {
      const templatesRef = this.getUserCollection('templates');
      const docRef = await addDoc(templatesRef, {
        ...templateData,
        createdAt: serverTimestamp()
      });
      return { id: docRef.id, ...templateData };
    } catch (error) {
      console.error('Error creating template:', error);
      throw error;
    }
  }

  async updateTemplate(templateId, templateData) {
    try {
      const templateRef = this.getUserDoc('templates', templateId);
      await updateDoc(templateRef, templateData);
      return { id: templateId, ...templateData };
    } catch (error) {
      console.error('Error updating template:', error);
      throw error;
    }
  }

  async deleteTemplate(templateId) {
    try {
      const templateRef = this.getUserDoc('templates', templateId);
      await deleteDoc(templateRef);
    } catch (error) {
      console.error('Error deleting template:', error);
      throw error;
    }
  }

  async getTemplates() {
    try {
      const templatesRef = this.getUserCollection('templates');
      const snapshot = await getDocs(templatesRef);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting templates:', error);
      throw error;
    }
  }

  // ========== SCHEDULE ==========

  async saveScheduleSlot(day, timeSlot, lessonId) {
    try {
      const scheduleRef = this.getUserCollection('schedule');
      const slotId = `${day}-${timeSlot}`;
      const slotRef = doc(scheduleRef, slotId);
      
      if (lessonId) {
        await setDoc(slotRef, {
          day,
          timeSlot,
          lessonId,
          updatedAt: serverTimestamp()
        });
      } else {
        await deleteDoc(slotRef);
      }
    } catch (error) {
      console.error('Error saving schedule slot:', error);
      throw error;
    }
  }

  async getSchedule() {
    try {
      const scheduleRef = this.getUserCollection('schedule');
      const snapshot = await getDocs(scheduleRef);
      
      const schedule = Array(6).fill(null).map(() => Array(5).fill(null));
      
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const lesson = await this.getLesson(data.lessonId);
        if (lesson) {
          schedule[data.timeSlot][data.day] = lesson;
        }
      }
      
      return schedule;
    } catch (error) {
      console.error('Error getting schedule:', error);
      throw error;
    }
  }

  // ========== BREAKS ==========

  async createBreak(breakData) {
    try {
      const breaksRef = this.getUserCollection('breaks');
      const docRef = await addDoc(breaksRef, {
        ...breakData,
        createdAt: serverTimestamp()
      });
      return { id: docRef.id, ...breakData };
    } catch (error) {
      console.error('Error creating break:', error);
      throw error;
    }
  }

  async deleteBreak(breakId) {
    try {
      const breakRef = this.getUserDoc('breaks', breakId);
      await deleteDoc(breakRef);
    } catch (error) {
      console.error('Error deleting break:', error);
      throw error;
    }
  }

  async getBreaks() {
    try {
      const breaksRef = this.getUserCollection('breaks');
      const snapshot = await getDocs(breaksRef);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting breaks:', error);
      throw error;
    }
  }

  // ========== USER PROFILE ==========

  async updateUserProfile(profileData) {
    try {
      const profileRef = this.getUserDoc('profile', 'data');
      await updateDoc(profileRef, {
        ...profileData,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }

  async getUserProfile() {
    try {
      const profileRef = this.getUserDoc('profile', 'data');
      const snapshot = await getDoc(profileRef);
      if (snapshot.exists()) {
        return snapshot.data();
      }
      return null;
    } catch (error) {
      console.error('Error getting profile:', error);
      throw error;
    }
  }
}

export const dbService = new DatabaseService();
