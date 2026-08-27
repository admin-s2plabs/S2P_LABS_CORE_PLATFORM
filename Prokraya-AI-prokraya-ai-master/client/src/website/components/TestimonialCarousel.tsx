import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

export interface CarouselItem {
    id: number;
    name: string;
    description: string;
    designation: string;
}

export default function TestimonialCarousel({ carouselItems }: { carouselItems: CarouselItem[] }) {
    const [current, setCurrent] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            next();
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const prev = () => {
        setCurrent((prev) => (prev - 1 + carouselItems.length) % carouselItems.length);
    };

    const next = () => {
        setCurrent((prev) => (prev + 1) % carouselItems.length);
    };

    return (
        <div className="relative w-full group overflow-hidden">
            <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{
                    transform: `translateX(-${current * 100}%)`,
                }}
            >
                {carouselItems.map((item, index) => (
                    <div key={index} className="min-w-full">
                        <div className="bg-gradient-to-br from-violet-600 to-teal-500 rounded-2xl p-8 text-white min-h-[330px] md:min-h-0">
                            <h3 className="text-xl font-bold mb-4">Team Insights</h3>
                            <p className="text-white/85 mb-6 italic leading-relaxed">
                                "{item.description}"
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                    {((w) =>
                                        w.length > 1
                                        ? `${w[0][0]}${w[w.length - 1][0]}`
                                        : w[0][0]
                                    )(item.name?.trim()?.split(/\s+/))?.toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-semibold text-sm">{item.name}</p>
                                    <p className="text-white/70 text-xs">{item.designation}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={prev}
                className="absolute left-4 top-1/2 -translate-y-1/2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 rounded-full bg-white p-3 shadow-lg"
            >
                <ArrowLeft />
            </button>

            <button
                type="button"
                onClick={next}
                className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 rounded-full bg-white p-3 shadow-lg"
            >
                <ArrowRight />
            </button>

            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                {carouselItems.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => setCurrent(index)}
                        className={`h-2 w-2 rounded-full ${current === index ? "bg-white" : "bg-gray-400"
                            }`}
                    />
                ))}
            </div>
        </div>
    );
}