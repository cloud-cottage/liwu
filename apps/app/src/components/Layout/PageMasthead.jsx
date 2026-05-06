import React from 'react'
import './PageMasthead.css'

const PageMasthead = ({
  eyebrow = '',
  title = '',
  slogan = '',
  rightSlot = null
}) => (
  <header className="page-masthead">
    <div className="page-masthead__row">
      <div className="page-masthead__content">
        {eyebrow ? <div className="page-masthead__eyebrow">{eyebrow}</div> : null}
        {title ? <h1 className="page-masthead__title">{title}</h1> : null}
        {slogan ? <p className="page-masthead__slogan">{slogan}</p> : null}
      </div>
      {rightSlot ? <div className="page-masthead__actions">{rightSlot}</div> : null}
    </div>
  </header>
)

export default PageMasthead
