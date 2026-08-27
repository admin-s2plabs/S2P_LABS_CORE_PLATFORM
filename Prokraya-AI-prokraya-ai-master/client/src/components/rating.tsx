const Rating = ({ rating, showRatingNumber, className }: { rating: number; showRatingNumber: boolean, className?: string }) => {
    const percentage = (rating / 5) * 100;
    return (
        <div className={"flex items-center gap-2 " + (className)}>
            <div className="relative text-lg leading-none">
                <div className="text-gray-300">
                    {"★★★★★"}
                </div>
                <div
                    className="absolute left-0 top-0 overflow-hidden whitespace-nowrap text-yellow-400"
                    style={{ width: `${percentage}%` }}
                >
                    {"★★★★★"}
                </div>
            </div>
            {showRatingNumber ?
                <span className="text-sm font-medium text-gray-700">
                    {rating.toFixed(1)}
                </span>
                : <></>
            }
        </div>
    );
};

export default Rating;