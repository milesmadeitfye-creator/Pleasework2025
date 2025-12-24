import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { GraduationCap, Play, CheckCircle, Clock, BookOpen, Award, TrendingUp, Target, Mail, BarChart3 } from 'lucide-react';

interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  thumbnail_url: string;
  order_index: number;
}

interface Lesson {
  id: string;
  course_id: string;
  title: string;
  description: string;
  video_url: string;
  duration: number;
  order_index: number;
}

interface Progress {
  lesson_id: string;
  completed: boolean;
}

export default function MarketingUniversity() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCourses();
    if (user) {
      fetchProgress();
    }
  }, [user]);

  useEffect(() => {
    if (selectedCourse) {
      fetchLessons(selectedCourse.id);
    }
  }, [selectedCourse]);

  const fetchCourses = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('marketing_courses')
      .select('*')
      .order('order_index', { ascending: true });

    if (data) {
      setCourses(data);
      if (data.length > 0 && !selectedCourse) {
        setSelectedCourse(data[0]);
      }
    }
    setLoading(false);
  };

  const fetchLessons = async (courseId: string) => {
    const { data } = await supabase
      .from('marketing_lessons')
      .select('*')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true });

    if (data) {
      setLessons(data);
    }
  };

  const fetchProgress = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_lesson_progress')
      .select('lesson_id, completed')
      .eq('user_id', user.id);

    if (data) {
      setProgress(data);
    }
  };

  const isLessonCompleted = (lessonId: string) => {
    return progress.some(p => p.lesson_id === lessonId && p.completed);
  };

  // const getCourseProgress = (courseId: string) => {
  //   const courseLessons = lessons.filter(l => l.course_id === courseId);
  //   if (courseLessons.length === 0) return 0;
  //
  //   const completed = courseLessons.filter(l => isLessonCompleted(l.id)).length;
  //   return Math.round((completed / courseLessons.length) * 100);
  // };

  const toggleLessonComplete = async (lessonId: string) => {
    if (!user) return;

    const isCompleted = isLessonCompleted(lessonId);

    if (isCompleted) {
      await supabase
        .from('user_lesson_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('lesson_id', lessonId);

      setProgress(progress.filter(p => p.lesson_id !== lessonId));
    } else {
      const { data } = await supabase
        .from('user_lesson_progress')
        .insert([{
          user_id: user.id,
          lesson_id: lessonId,
          completed: true,
          completed_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (data) {
        setProgress([...progress, { lesson_id: lessonId, completed: true }]);
      }
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'text-green-400 bg-green-500/20';
      case 'intermediate':
        return 'text-yellow-400 bg-yellow-500/20';
      case 'advanced':
        return 'text-red-400 bg-red-500/20';
      default:
        return 'text-gray-400 bg-gray-500/20';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'basics':
        return BookOpen;
      case 'social media':
        return TrendingUp;
      case 'advertising':
        return Target;
      case 'email':
        return Mail;
      case 'analytics':
        return BarChart3;
      default:
        return GraduationCap;
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading courses...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <GraduationCap className="w-8 h-8 text-blue-400" />
            Marketing University
          </h2>
          <p className="text-gray-400">Master music marketing with our comprehensive courses</p>
        </div>
        <div className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded-lg">
          <div className="text-sm text-blue-300">
            {progress.length} lessons completed
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-lg font-semibold mb-4">Courses</h3>
          {courses.map((course) => {
            const Icon = getCategoryIcon(course.category);
            return (
              <button
                key={course.id}
                onClick={() => setSelectedCourse(course)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selectedCourse?.id === course.id
                    ? 'bg-blue-600 border-blue-500'
                    : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex items-start gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${selectedCourse?.id === course.id ? 'bg-white/20' : 'bg-blue-500/20'}`}>
                    <Icon className={`w-5 h-5 ${selectedCourse?.id === course.id ? 'text-white' : 'text-blue-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm mb-1">{course.title}</h4>
                    <span className={`text-xs px-2 py-1 rounded-full ${getDifficultyColor(course.difficulty)}`}>
                      {course.difficulty}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-2">
          {selectedCourse ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="mb-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold mb-2">{selectedCourse.title}</h3>
                    <p className="text-gray-400 mb-4">{selectedCourse.description}</p>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${getDifficultyColor(selectedCourse.difficulty)}`}>
                        {selectedCourse.difficulty.toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-500">{selectedCourse.category}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold">Lessons</h4>
                  {lessons.length > 0 && (
                    <span className="text-sm text-gray-400">
                      {lessons.filter(l => isLessonCompleted(l.id)).length} / {lessons.length} completed
                    </span>
                  )}
                </div>

                {lessons.length === 0 ? (
                  <div className="text-center py-12 bg-black rounded-lg border border-gray-800">
                    <Play className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400 mb-2">No lessons available yet</p>
                    <p className="text-sm text-gray-500">Check back soon for new content!</p>
                  </div>
                ) : (
                  lessons.map((lesson, index) => {
                    const completed = isLessonCompleted(lesson.id);
                    return (
                      <div
                        key={lesson.id}
                        className={`p-4 rounded-lg border transition-all ${
                          completed
                            ? 'bg-green-500/10 border-green-500/30'
                            : 'bg-black border-gray-800 hover:border-gray-700'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            completed ? 'bg-green-500/20' : 'bg-blue-500/20'
                          }`}>
                            {completed ? (
                              <CheckCircle className="w-5 h-5 text-green-400" />
                            ) : (
                              <span className="text-sm font-semibold text-blue-400">{index + 1}</span>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h5 className="font-semibold mb-1">{lesson.title}</h5>
                            <p className="text-sm text-gray-400 mb-3">{lesson.description}</p>

                            <div className="flex items-center gap-4">
                              {lesson.video_url ? (
                                <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                                  <Play className="w-4 h-4" />
                                  Watch Lesson
                                </button>
                              ) : (
                                <div className="px-4 py-2 bg-gray-800 text-gray-400 text-sm font-medium rounded-lg flex items-center gap-2">
                                  <Clock className="w-4 h-4" />
                                  Coming Soon
                                </div>
                              )}

                              {lesson.duration > 0 && (
                                <span className="text-sm text-gray-500">
                                  {Math.floor(lesson.duration / 60)}:{(lesson.duration % 60).toString().padStart(2, '0')}
                                </span>
                              )}

                              <button
                                onClick={() => toggleLessonComplete(lesson.id)}
                                className={`ml-auto px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                  completed
                                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                                    : 'bg-green-600 hover:bg-green-700 text-white'
                                }`}
                              >
                                {completed ? 'Mark Incomplete' : 'Mark Complete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <GraduationCap className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Select a Course</h3>
              <p className="text-gray-400">Choose a course from the list to start learning</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-6 border border-blue-500/50">
          <div className="flex items-center gap-3 mb-2">
            <Award className="w-8 h-8 text-white" />
            <div className="text-3xl font-bold">{courses.length}</div>
          </div>
          <div className="text-blue-100">Total Courses</div>
        </div>

        <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-xl p-6 border border-green-500/50">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="w-8 h-8 text-white" />
            <div className="text-3xl font-bold">{progress.length}</div>
          </div>
          <div className="text-green-100">Lessons Completed</div>
        </div>

        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-6 border border-purple-500/50">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-8 h-8 text-white" />
            <div className="text-3xl font-bold">
              {courses.length > 0 ? Math.round((progress.length / (courses.length * 5)) * 100) : 0}%
            </div>
          </div>
          <div className="text-purple-100">Overall Progress</div>
        </div>
      </div>
    </div>
  );
}
