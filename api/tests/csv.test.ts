import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csvCell,csvDocument} from '../csv';

test('CSV fields preserve data with RFC4180 quoting and CRLF records',()=>{
 assert.equal(csvDocument(['one','two'],[['a,b','a"b'],['line\r\nbreak','plain']]),'"one","two"\r\n"a,b","a""b"\r\n"line\r\nbreak","plain"');
 assert.equal(csvCell(null),'""');
});
test('CSV formula prefixes, tab and null are neutralized without erasing original bytes',()=>{
 for(const value of ['=1+1','+1','-1','@SUM(A1)','\tplain','\0plain',' \t=1','\r\n+1','\u00a0@SUM(A1)','\0 \t-4'])assert.equal(csvCell(value),'"\''+value.replaceAll('"','""')+'"');
});
test('ordinary CSV values, Unicode and internal formula characters remain intact',()=>{
 for(const value of ['Engineering','नमस्ते','a=b','name@example.test','  plain','12','0'])assert.equal(csvCell(value),'"'+value+'"');
});
