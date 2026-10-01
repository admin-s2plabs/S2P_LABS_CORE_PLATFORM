import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { BlogPost, BlogPosts } from "../components/Blog-Posts";
import { LogoBlack } from "../components/LogoImport";

export function BlogsPage() {
  const itemsPerPage = 4;
  const [pagination, setPagination] = useState({
    page: 0,
    totalPages: Math.ceil(BlogPosts.length / itemsPerPage),
  });
  const indexOfLastItem = (pagination.page + 1) * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = BlogPosts?.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="S2P Labs Procurement Blog" />
        <meta property="og:description" content="Insights, best practices, and the latest trends in modern procurement, sourcing, supplier management, and spend analytics." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/blogs" />
        <meta property="og:site_name" content="S2P Labs" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>Procurement Blog | Procurement Insights, Trends & Best Practices | S2P Labs</title>
        <meta name="description" content="Explore expert insights on procurement, sourcing, supplier management, spend analytics, procurement automation, contract management, and digital transformation from the S2P Labs team." />
        <meta name="keywords" content="procurement blog, procurement technology, sourcing best practices, supplier management, spend analytics, procurement automation, source to pay, procurement trends, procurement technology" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-14 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">Blog</span>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-4">S2P Labs Blog</h1>
            <p className="text-lg text-gray-500 mb-8">Insights, best practices, and the latest trends in modern procurement</p>
            {/* <div className="max-w-lg mx-auto relative">
            <input type="text" placeholder="Search articles..." className="w-full px-5 py-3 pr-12 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none text-sm" />
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div> */}
          </div>
        </section>

        {/* Categories */}
        {/* <section className="py-5 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-2 justify-center">
            {categories.map((category, index) => (
              <button
                key={index}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${index === 0 ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section> */}

        {/* Blog Grid */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentItems?.map((post: BlogPost, index) => (
                <Link href={post.pathname} key={index} className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-md transition-all group">
                  <div className="bg-gradient-to-br from-violet-50 to-teal-50 flex items-center justify-center h-[250px]">
                    <img
                      className="w-full max-w-[430px] h-[250px]"
                      src={post.img}
                      alt={post.text}
                      loading="lazy"
                    />
                  </div>
                  <div className="p-6">
                    <h2 className="font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-violet-600 transition-colors">{post.text}</h2>
                    <p className="text-sm text-gray-500 mb-4 line-clamp-3">{post.subheading}</p>
                    <Link href={post.pathname} className="mt-4 flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:gap-2.5 transition-all">
                      Read More <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </Link>
              ))}
            </div>

          </div>
        </section>

        {/* Newsletter */}
        <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
          <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-3">Subscribe to Our Newsletter</h2>
            <p className="text-gray-400 mb-8">Get the latest procurement insights delivered to your inbox</p>
            <div className="flex gap-3">
              <input type="email" placeholder="Enter your email" className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm" />
              <button className="px-5 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors whitespace-nowrap text-sm">
                Subscribe
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
