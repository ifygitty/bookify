import Link from "next/link";
import {BookCardProps} from "@/types";
import Image from "next/image";
import { AlarmPlus } from "lucide-react";


const BookCard = ({ title, author, coverURL, slug }: BookCardProps) => {
    return (
        <Link href={`/books/${slug}`}>
            <article className="book-card">
                <figure className="book-card-figure">
                    <div className="book-card-cover-wrapper">
                        <Image src={coverURL} alt={title} width={133} height={200} className="book-card-cover" />
                    </div>

                    <figcaption className="book-card-meta">
                        <h3 className="book-card-title">{title}</h3>
                        <p className="book-card-author">{author}</p>
                    </figcaption>
                </figure>
            </article>
        </Link>
    )
}
export default BookCard








// agendas
// 1 review on the previous  annual return and event 
// 2. what to do to events and ceremonies to be well cordinated and super Organied such as considering media coverage , security and ligthening , red carpet recognition etc
// 3. media coverage , security and lightenig around the field.
// 4. red carpet recognition 


// discussion
// 1. political aspirants are to be invited so that we and the community will pray for them and support to achieve there Goal(moderate invitation of elction) and remove it from agenda and put it in discussion

// 2. the following was appointed to work on Invitation and proposal. Ozor jkings, Akuewebe, chekwubee, new Man, une50, oliver obugo, scofield (use it moderate where we wrote about Invitation commitee)

// 3. under the ijele masqurade patnership moderate it with that it was proosed that let the iwollo and aguobu do the masqurade in order to reduce burden for young advocates

// 4. then fine for absentees i want you to moderate it with if a youg advocate is celebrating something maybe wedding or any big event or IYA event and its happening within ur state or if you are in east and its happening in east that you must attend or have a very tangible reason for missing it that it compulsory you attend if not it will attract a fine

// attendance
// ozor jkings
// Anieke Henry Anene 
// cheteze chekwube 
// Ekwuazi Ifeanyi Maxwell
// Amuche james
// Tochukwu  Ezeakor
// Ejike otugo
// Nonso obi
// Akuenewebe magbo ifeanyi
// chiedu Aamalu 
// Chinedu Johnkennedy
// Chekwubee (Superking)

