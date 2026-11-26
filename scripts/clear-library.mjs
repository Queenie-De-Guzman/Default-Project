import { all, db, run } from '../server/db.js';

// Clears Story Library data and the teaching materials imported for those stories.
// Users, classes, seeded games and lessons are preserved.
const counts = () => ({
  stories: all('SELECT COUNT(*) c FROM stories')[0].c,
  materials: all('SELECT COUNT(*) c FROM teaching_materials')[0].c,
  sections: all('SELECT COUNT(*) c FROM story_sections')[0].c,
  comprehension: all('SELECT COUNT(*) c FROM story_comprehension')[0].c,
  presentations: all('SELECT COUNT(*) c FROM presentation_sessions')[0].c,
  storyPresentations: all('SELECT COUNT(*) c FROM story_presentation_sessions')[0].c
});

console.log('Before:', counts());

// Remove dependent analysis/game drafts first so no orphan records remain.
run("DELETE FROM generated_games WHERE story_id IS NOT NULL");
run("DELETE FROM ai_analyses WHERE source_type='story'");
// Story child rows, favorites, reading sessions and assignments cascade from stories.
run('DELETE FROM stories');
// Live presentation state is tied to the materials removed below.
run('DELETE FROM presentation_sessions');
run('DELETE FROM story_presentation_sessions');
// The starter-pack manuscripts were uploaded only to seed the Story Library.
run('DELETE FROM teaching_materials');
run("DELETE FROM content_imports WHERE source_type IN ('material','story')");

console.log('After:', counts());
db.close();
