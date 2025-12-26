import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageShell } from '../components/layout/PageShell';
import {
  Search,
  Rocket,
  Sparkles,
  Link2,
  MessageCircle,
  Target,
  Users,
  Wallet,
  BarChart3,
  Settings,
  Clock,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import {
  guideCategories,
  guideArticles,
  searchGuides,
  getArticlesByCategory,
  getArticleBySlug,
  getRelatedArticles,
  type GuideArticle
} from '../lib/guideContent';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const iconMap: Record<string, any> = {
  Rocket,
  Sparkles,
  Link2,
  MessageCircle,
  Target,
  Users,
  Wallet,
  BarChart3,
  Settings
};

export default function HelpCenter() {
  const { category: categoryParam, slug: slugParam } = useParams<{ category?: string; slug?: string }>();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryParam || null);
  const [selectedArticle, setSelectedArticle] = useState<GuideArticle | null>(null);

  useMemo(() => {
    if (categoryParam && slugParam) {
      const article = getArticleBySlug(categoryParam, slugParam);
      if (article) {
        setSelectedArticle(article);
        setSelectedCategory(categoryParam);
      }
    }
  }, [categoryParam, slugParam]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchGuides(searchQuery);
  }, [searchQuery]);

  const categoryArticles = useMemo(() => {
    if (!selectedCategory) return [];
    return getArticlesByCategory(selectedCategory);
  }, [selectedCategory]);

  const relatedArticles = useMemo(() => {
    if (!selectedArticle) return [];
    return getRelatedArticles(selectedArticle.id);
  }, [selectedArticle]);

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setSelectedArticle(null);
    setSearchQuery('');
    navigate(`/help/${categoryId}`);
  };

  const handleArticleClick = (article: GuideArticle) => {
    setSelectedArticle(article);
    setSearchQuery('');
    navigate(`/help/${article.category}/${article.slug}`);
  };

  const handleBackToCategory = () => {
    setSelectedArticle(null);
    if (selectedCategory) {
      navigate(`/help/${selectedCategory}`);
    } else {
      navigate('/help');
    }
  };

  const handleBackToHome = () => {
    setSelectedCategory(null);
    setSelectedArticle(null);
    navigate('/help');
  };

  return (
    <PageShell title="Help Center" fullWidth>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-500/10 rounded-xl">
              <BookOpen className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Help Center</h1>
              <p className="text-gray-400 text-sm">Guides, tutorials, and best practices</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guides..."
              className="w-full pl-12 pr-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Search Results */}
          {searchQuery && searchResults.length > 0 && (
            <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4 max-w-2xl">
              <p className="text-sm text-gray-400 mb-3">{searchResults.length} results found</p>
              <div className="space-y-2">
                {searchResults.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => handleArticleClick(article)}
                    className="w-full text-left p-3 rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    <p className="text-white font-medium">{article.title}</p>
                    <p className="text-sm text-gray-400 mt-1">{article.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Categories */}
          <div className="lg:col-span-1">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sticky top-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Categories</h3>
              <div className="space-y-1">
                {guideCategories.map((category) => {
                  const Icon = iconMap[category.icon];
                  const isActive = selectedCategory === category.id;

                  return (
                    <button
                      key={category.id}
                      onClick={() => handleCategoryClick(category.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'hover:bg-gray-800 text-gray-300'
                      }`}
                    >
                      {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
                      <span className="text-sm font-medium">{category.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            {!selectedCategory && !selectedArticle && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-6">Browse by Category</h2>
                <div className="grid gap-4">
                  {guideCategories.map((category) => {
                    const Icon = iconMap[category.icon];
                    const articles = getArticlesByCategory(category.id);

                    return (
                      <button
                        key={category.id}
                        onClick={() => handleCategoryClick(category.id)}
                        className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-left hover:border-gray-700 transition-colors group"
                      >
                        <div className="flex items-start gap-4">
                          <div className="p-3 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                            {Icon && <Icon className="w-6 h-6 text-blue-400" />}
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-white mb-1">{category.name}</h3>
                            <p className="text-sm text-gray-400 mb-3">{category.description}</p>
                            <p className="text-xs text-gray-500">{articles.length} articles</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedCategory && !selectedArticle && (
              <div>
                <button
                  onClick={handleBackToHome}
                  className="text-sm text-blue-400 hover:text-blue-300 mb-4 flex items-center gap-1"
                >
                  ← Back to categories
                </button>

                <h2 className="text-2xl font-bold text-white mb-6">
                  {guideCategories.find((c) => c.id === selectedCategory)?.name}
                </h2>

                <div className="space-y-3">
                  {categoryArticles.map((article) => (
                    <button
                      key={article.id}
                      onClick={() => handleArticleClick(article)}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl p-5 text-left hover:border-gray-700 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
                            {article.title}
                          </h3>
                          <p className="text-sm text-gray-400 mb-3">{article.description}</p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {article.estimatedMinutes} min read
                            </span>
                            {article.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="px-2 py-1 bg-gray-800 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedArticle && (
              <div>
                <button
                  onClick={handleBackToCategory}
                  className="text-sm text-blue-400 hover:text-blue-300 mb-4 flex items-center gap-1"
                >
                  ← Back to {guideCategories.find((c) => c.id === selectedArticle.category)?.name}
                </button>

                <article className="bg-gray-900 border border-gray-800 rounded-xl p-8">
                  <div className="mb-6">
                    <h1 className="text-3xl font-bold text-white mb-3">{selectedArticle.title}</h1>
                    <p className="text-gray-400 mb-4">{selectedArticle.description}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {selectedArticle.estimatedMinutes} min read
                      </span>
                      {selectedArticle.tags.map((tag) => (
                        <span key={tag} className="px-2 py-1 bg-gray-800 rounded-full text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Screenshots */}
                  {selectedArticle.screenshots.length > 0 && (
                    <div className="mb-8 space-y-4">
                      {selectedArticle.screenshots.map((screenshot, index) => (
                        <div key={index} className="rounded-xl overflow-hidden border border-gray-800">
                          <img
                            src={`/help-screenshots/${screenshot}`}
                            alt={`Screenshot ${index + 1}`}
                            className="w-full"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Article Content */}
                  <div className="prose prose-invert prose-blue max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <h1 className="text-2xl font-bold text-white mt-8 mb-4">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-xl font-bold text-white mt-6 mb-3">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-lg font-semibold text-white mt-4 mb-2">{children}</h3>,
                        p: ({ children }) => <p className="text-gray-300 mb-4 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside text-gray-300 mb-4 space-y-2">{children}</ol>,
                        li: ({ children }) => <li className="text-gray-300">{children}</li>,
                        a: ({ href, children }) => (
                          <a href={href} className="text-blue-400 hover:text-blue-300 underline">
                            {children}
                          </a>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-400 my-4">
                            {children}
                          </blockquote>
                        ),
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-6">
                            <table className="w-full border-collapse">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="bg-gray-800">{children}</thead>,
                        tbody: ({ children }) => <tbody>{children}</tbody>,
                        tr: ({ children }) => <tr className="border-b border-gray-800">{children}</tr>,
                        th: ({ children }) => (
                          <th className="px-4 py-2 text-left text-sm font-semibold text-white">{children}</th>
                        ),
                        td: ({ children }) => <td className="px-4 py-2 text-sm text-gray-300">{children}</td>,
                      }}
                    >
                      {selectedArticle.content}
                    </ReactMarkdown>
                  </div>
                </article>
              </div>
            )}
          </div>

          {/* Right Sidebar - Related & Next Steps */}
          {selectedArticle && (
            <div className="lg:col-span-1">
              <div className="sticky top-6 space-y-4">
                {/* Related Articles */}
                {relatedArticles.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Related Articles</h3>
                    <div className="space-y-2">
                      {relatedArticles.map((article) => (
                        <button
                          key={article.id}
                          onClick={() => handleArticleClick(article)}
                          className="w-full text-left p-3 rounded-lg hover:bg-gray-800 transition-colors"
                        >
                          <p className="text-sm font-medium text-white">{article.title}</p>
                          <p className="text-xs text-gray-500 mt-1">{article.estimatedMinutes} min read</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Quick Actions</h3>
                  <div className="space-y-2">
                    <a
                      href="/studio/ghoste-ai"
                      className="block p-3 rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      <p className="text-sm font-medium text-white">Ask Ghoste AI</p>
                      <p className="text-xs text-gray-500 mt-1">Get instant answers</p>
                    </a>
                    <a
                      href="/dashboard"
                      className="block p-3 rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      <p className="text-sm font-medium text-white">View Dashboard</p>
                      <p className="text-xs text-gray-500 mt-1">Check your progress</p>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
