var ast = require('mkast')
  , UNIVERSAL = '*'
  , FIRST_CHILD = ':first-child'
  , LAST_CHILD = ':last-child'
  , ONLY_CHILD = ':only-child'
  , NTH_CHILD = ':nth-child'
  , NOT = ':not'
  , HAS = ':has'
  , EMPTY = ':empty'
  , COMMENT = '::comment'
  , PI = '::pi'
  , DOCTYPE = '::doctype'
  , CDATA = '::cdata'
  , ELEMENT = '::element'
  // content attribute
  , CONTENT = 'content'
  , walker = ast.NodeWalker
  , literal = walker.literal
  , Node = ast.Node;

/**
 *  Represents a compiled selector.
 *
 *  @constructor Selector
 *  @param {Selector} parent a parent selector.
 */
function Selector(parent) {
  this.parent = parent;
}

function isContainerRequired(type) {
  return (type === Node.EMPH
    || type === Node.STRONG
    || type === Node.ITEM
    || type === Node.CODE
    || type === Node.LINK
    || type === Node.IMAGE
    || type === Node.TEXT
    || type === Node.LINEBREAK
    || type === Node.SOFTBREAK
  );
}

/**
 *  Determine if an input node is of the type assigned to this selector.
 *
 *  @private {function} is
 *  @param {Object} node input node.
 *  
 *  @returns Boolean whether the node type matches this selector.
 */
function is(node) {
  var type = node.type
    , tag = this.tag;

  if(tag === UNIVERSAL) {
    return true; 
  }

  if(type === Node.LIST) {
    if(tag === 'ul') {
      return node.listType === 'bullet';
    }else if(tag === 'ol'){
      return node.listType === 'ordered';
    }
  }else if(type === Node.ITEM && this.parent) {
    if(this.parent.tag === 'ul') {
      return node.listType === 'bullet';
    /* istanbul ignore else: prefer to be explicit here */
    }else if(this.parent.tag === 'ol') {
      return node.listType === 'ordered';
    }
  }else if(type === Node.HEADING) {
    switch(tag) {
      case 'h1':
        return node.level === 1;
      case 'h2':
        return node.level === 2;
      case 'h3':
        return node.level === 3;
      case 'h4':
        return node.level === 4;
      case 'h5':
        return node.level === 5;
      case 'h6':
        return node.level === 6;
    } 
  }

  return this.type === type;
}

function children(node, selector, deep) {
  var nodes = []
    , j
    , matcher;

  selector = selector || this.selector;

  function walk(node, recursive) {
    var child = node.firstChild
      , i = 0;

    while(child) {
      matcher = selector.test(child, i);
      if(matcher.matched) {
        for(j = 0;j < matcher.nodes.length;j++) {
          if(!~nodes.indexOf(matcher.nodes[j])) {
            nodes.push(matcher.nodes[j]) 
          } 
        }
      }

      if(recursive && child.firstChild) {
        walk(child, recursive); 
      }

      child = child.next; 
      i++;
    }
  }

  walk(node, deep || Boolean(!this.child));

  return nodes;
}

/**
 *  Test an input node against this selector.
 *
 *  @private {function} test
 *  @param {Object} node input node.
 *
 *  @returns Object with a `matched` boolean and `nodes` array list.
 */
function test(node, index) {
  
  // check for combinator only: `> p`, `+ p` and `~ p`
  if(!this.tag && !this.attributes && !this.pseudo
    && ((this.child || this.adjacent || this.following) && this.selector)) {
    return this.selector.test(node, index);
  }

  var res = (this.tag || this.attributes || this.pseudo)
    , matcher
    , matched
    , sibling
    , i
    , nodes = [];

  // adjacent/following selectors and no next node - can't possibly match
  if((this.adjacent || this.following) && !node.next) {
    return false; 
  }

  // check type of node
  if(res && this.tag) {
    res = res && this.is(node);
  }

  if(res && this.attributes) {
    res = res && this.attr(node);
  }

  // match pseudo selectors
  if(res && this.pseudo) {
    // :first-child
    if(this.pseudo.name === FIRST_CHILD) {
      res = res && (node.parent && node.parent.firstChild === node);
    // :last-child
    }else if(this.pseudo.name === LAST_CHILD) {
      res = res && (node.parent && node.parent.lastChild === node);
    // :only-child
    }else if(this.pseudo.name === ONLY_CHILD) {
      res = res && (node.parent
        && node.parent.firstChild === node
        && !node.next);
    // :empty
    }else if(this.pseudo.name === EMPTY) {
      res = res && !node.firstChild;
    // :not()
    }else if(this.pseudo.name === NOT && this.not) {
      for(i = 0;i < this.not.length;i++) {
        matcher = this.not[i].test(node, index);
        res = res && !matcher.matched;
        if(!res) {
          break;
        }
      }
    // :has()
    }else if(this.pseudo.name === HAS && this.has) {
      for(i = 0;i < this.has.length;i++) {
        matcher = this.children(node, this.has[i]);
        res = res && matcher.length;
        if(!res) {
          break;
        }
      }
    // :nth-child()
    }else if(this.pseudo.name === NTH_CHILD && this.pseudo.nth) {
      res = res && this.nth(index);
    // html block and inline pseudo elements
    /* istanbul ignore else: no more pseudo elements at the moment */
    }else if(
      this.pseudo.name === COMMENT
      || this.pseudo.name === PI
      || this.pseudo.name === DOCTYPE
      || this.pseudo.name === CDATA
      || this.pseudo.name === ELEMENT) {

      res = res
        && (node.type === Node.HTML_BLOCK || node.type === Node.HTML_INLINE);

      if(res) {
        switch(this.pseudo.name) {
          case COMMENT:
            res = res && node._htmlBlockType === 2;
            break;
          case PI:
            res = res && node._htmlBlockType === 3;
            break;
          case DOCTYPE:
            res = res && node._htmlBlockType === 4;
            break;
          case CDATA:
            res = res && node._htmlBlockType === 5;
            break;
          case ELEMENT:
            res = res 
              && (node._htmlBlockType === 1 || node._htmlBlockType === 6);
            break;
        }

      }
    }
  }

  // matched the input node
  if(res && !nodes.length) {
    nodes = [node]; 
  }

  //console.error('test on node type: %s %s %s', node.type, this.tag, res);

  // child selector to match
  if(res && this.selector) {
    // adjacent sibling combinator (+)
    if(this.adjacent) {
      //console.error('adjacent %s', node.next)
      matcher = this.selector.test(node.next, index + 1);
      if(matcher.matched) {
        nodes = matcher.nodes; 
      }
      res = matcher.matched;
    // following sibling combinator (~)
    }else if(this.following) {
      matched = false;
      sibling = node.next;
      while(sibling) {
        index++;
        matcher = this.selector.test(sibling, index);
        if(matcher.matched) {
          // empty previously matched nodes
          // on the first following sibling match
          if(!matched) {
            nodes = []; 
          }
          matched = true;
          nodes = nodes.concat(matcher.nodes); 
        }
        sibling = sibling.next;
      }

      res = res && matched;
    // descendants (whitespace | >>) and children (>)
    }else{
      // overwrite any previously matched nodes when descending on 
      // child selector
      nodes = this.children(node); 
    }
  }

  // greedy matching for tags: p
  if(!this.selector && this.tag) {
    if(!this.parent
      || (this.parent
        && !this.parent.child
        && !this.parent.adjacent
        && !this.parent.following)) {
      nodes = nodes.concat(this.children(node, this, true));
      res = res || nodes.length;
    }
  }

  return {matched: res, nodes: nodes};
}

/**
 *  Get nodes that match this selector.
 *
 *  @function exec
 *  @param {Array} nodes list of input nodes.
 *  @param {Array} matches list to place matched nodes.
 */
function exec(nodes, matches) {
  var i
    , node
    , matcher
    , inlineQuery =
      (
       !this.parent && this.type && isContainerRequired(this.type)
       || (
            !this.parent 
            && !this.type
            && (this.pseudo && this.pseudo.name === EMPTY)
          )
      );

  function add(nodes) {
    for(var j = 0;j < nodes.length;j++) {
      node = nodes[j];
      // avoid duplicates for overlapping queries
      if(!~matches.indexOf(node)) {
        matches.push(node);
      }
    }
  }

  for(i = 0;i < nodes.length;i++) {

    // walk children when the first
    // selector requires a container
    if(inlineQuery) {
      matcher = this.children(nodes[i], this);
      add(matcher);
    }else{
      matcher = this.test(nodes[i], i);
      if(matcher.matched) {
        add(matcher.nodes);
      }
    }
  }
}

/**
 *  Builds a map of attributes for the input node and test attribute selectors 
 *  against the generated map.
 *
 *  @private {function} attr
 *  @param {Object} node input node.
 *
 *  @returns Boolean true if all attribute selectors match.
 */
function attr(node) {
  var map = {}
    , res = true
    , i
    , val
    , att;

  if(node.literal) {
    map.literal = node.literal; 
  }

  switch(node.type) {
    case Node.LIST:
    case Node.ITEM:
      if(node.listDelimiter) {
        map.delimiter = node.listDelimiter; 
      }
      if(node._listData && node._listData.bulletChar) {
        map.bullet = node._listData.bulletChar; 
      }
      break;
    case Node.CODE_BLOCK:
      map.info = node.info;
      if(node._isFenced || node.isFenced) {
        map.fenced = '1';
      }
      break;
    case Node.LINK:
      map.href = node.destination;
      map.title = node.title;
      break;
    case Node.IMAGE:
      map.src = node.destination;
      map.title = node.title;
      break;
  }

  for(i = 0;i < this.attributes.length;i++) {
    att = this.attributes[i];

    // lazily create content attribute the first time we encounter
    // a `content` attribute selector
    if(att.attr === CONTENT && !map[CONTENT]) {
      map[CONTENT] = literal(node);
    }

    val = map[att.attr];
    // just test the property exists
    if(!att.operator) {
      res = res && (val !== undefined && val !== null);
    // has an operator and operand
    }else{
      res = res 
        && (val !== undefined && val !== null)
        && this.operator(att.attr, att.operator, att.value, val);
    }
  }

  return res;
}

/**
 *  Compare attributes when an operator is present in the attribute selector.
 *
 *  @private {function} operator
 *  @param {String} attr name of the attribute.
 *  @param {String} op the operator.
 *  @param {String} operand the operand in the attribute selector.
 *  @param {String} value current value for the attribute.
 *
 *  @see https://developer.mozilla.org/en-US/docs/Web/CSS/Attribute_selectors
 *
 *  @returns Boolean whether the attribute selector matches.
 */
function operator(attr, op, operand, value) {
  var res = true;
  switch(op) {
    case '=':
      res = res && (operand === value);
      break;
    case '~=':
      res = res && ~(value.split(/\s+/).indexOf(operand));
      break;
    case '|=':
      res = res && (operand === value || value.indexOf(operand + '-') === 0);
      break;
    case '^=':
      res = res && (value.indexOf(operand) === 0);
      break;
    case '$=':
      res = res && 
        ((value.lastIndexOf(operand) + operand.length) === value.length);
      break;
    case '*=':
      res = res && (~value.indexOf(operand));
      break;
    // extension to the operators to match by regexp pattern
    // compiler has already created the regexp
    case '=~':
      res = res && operand.test(value);
      break;
  }
  return res;
}

function nth(index) {
  var n = this.pseudo.nth
    , i = 0
    , invert = n.op1 === '-'
    , extra = n.digit2 || 1
    , val
    , res;

  // zero multiplier :nth-child(0n+1)
  if(n.digit1 === 0 && n.n && n.digit2) {
    res = (index + 1) === n.digit2;
  // exact match :nth-child(5);
  }else if(
    n.op1 === undefined && n.digit1 !== undefined && !n.n && !n.digit2) {
    res = (index + 1) === n.digit1;
  }else{
    for(;i < (index + extra);i++) {
      val = i;
      if(n.digit1) {
        val = i * n.digit1;
      }
      if(invert) {
        val = -val; 
      }
      if(n.op2 && n.digit2) {
        if(n.op2 === '+') {
          val += n.digit2;
        }else{
          val -= n.digit2;
        }
      }

      if(val === index + 1) {
        res = true; 
        break;
      }
    }

  }

  return res;
}

//function isCombinator() {

//}

Selector.prototype.test = test;
Selector.prototype.exec = exec;
Selector.prototype.children = children;
Selector.prototype.is = is;
Selector.prototype.attr = attr;
Selector.prototype.nth = nth;
Selector.prototype.operator = operator;

module.exports = Selector;
