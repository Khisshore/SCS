/**
 * PROGRAMME MODEL
 * Handles programme-related database operations
 */

import { db, STORES } from '../db/database.js';

class ProgrammeModel {
  /**
   * Create a new programme
   * @param {string} name - Programme name
   * @param {string} course - Parent course type (Diploma, BBA, MBA, DBA, Other)
   * @returns {Promise<number>} - Created programme ID
   */
  async create(name, course) {
    if (!name) throw new Error('Programme name is required');
    if (!course) throw new Error('Course type is required');

    const programme = {
      name: name.trim(),
      course: course,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return await db.add(STORES.PROGRAMMES, programme);
  }

  /**
   * Find all programmes
   * @returns {Promise<Array>} - Array of programmes
   */
  async findAll() {
    const programmes = await db.getAll(STORES.PROGRAMMES);
    return programmes.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find programmes by course type
   * @param {string} course - Course type
   * @returns {Promise<Array>} - Array of programmes
   */
  async findByCourse(course) {
    const programmes = await db.getByIndex(STORES.PROGRAMMES, 'course', course);
    return programmes.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find or create a programme
   * @param {string} name - Programme name
   * @param {string} course - Course type
   * @returns {Promise<object>} - The programme object
   */
  async getOrCreate(name, course) {
    const allProgrammes = await this.findAll();
    const existing = allProgrammes.find(p => p.name.toLowerCase() === name.toLowerCase());
    
    if (existing) {
      if (existing.course !== course) {
        // Update course if changed
        await db.update(STORES.PROGRAMMES, { ...existing, course, updatedAt: new Date().toISOString() });
        return { ...existing, course };
      }
      return existing;
    }

    const id = await this.create(name, course);
    return { id, name, course };
  }
  /**
   * Delete a programme by name
   * @param {string} name - Programme name to delete
   * @returns {Promise<boolean>} - True if deleted
   */
  async deleteByName(name) {
    const allProgrammes = await this.findAll();
    const programme = allProgrammes.find(p => p.name === name);
    
    if (programme) {
      await db.delete(STORES.PROGRAMMES, programme.id);
      return true;
    }
    return false;
  }
}

// Export singleton instance
export const Programme = new ProgrammeModel();
