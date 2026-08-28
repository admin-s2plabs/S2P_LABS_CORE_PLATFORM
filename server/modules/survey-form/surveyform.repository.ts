import { number } from "zod";
import { pool } from "../../db";
import { getContextPool } from "../../tenant-context";
import {
  isExportAllRows,
  listPaginationMeta,
  parseListPageLimit,
} from "../_shared/list-pagination";
const getPool = () => getContextPool() ?? pool;

export async function saveForm(data: any,userName: string)
{
    const seq = await getPool().query(`SELECT nextval('dbo.supp_survey_seq_id')::int AS id`);
    const id = seq.rows[0].id;
    let prefix: string;

    const result = await getPool().query(
      `INSERT INTO dbo.supp_surveyform_hdr_dtls (
       id, title,type,status,created_by,CREATION_DATE,style,
       role,attribute_5,attribute_4) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) 
    RETURNING *`,
      [
        id,
        data.title,
        data.type ,
        "Draft",
        userName,
        new Date(),
        data.style,
        data.role,
        data.attribute_5,
        "Active",
      ]
  );
  return result.rows[0];
}

export async function findFormById(id: string) 
{
    const result = await getPool().query(`SELECT * FROM dbo.supp_surveyform_hdr_dtls WHERE id = $1`, [id]);
    return result.rows[0];
}

export async function findRespFormById(id: string,poNumber:string) 
{
    const result = await getPool().query(`SELECT * FROM dbo.supp_survey_resp_hdr_dtls WHERE survey_id = $1 and po_number=$2`, [Number(id),poNumber]);
    return result.rows[0];
}

export async function listForms(page: number, limit: number, filters: any)
{
    const offset = (page - 1) * limit;
    const whereClauses: string[] = [];
    const values: any[] = [];  
}

export async function updateForm(id: string, data: any)
{

}

export async function deleteForm(id: string)
{
    try
    {
        await getPool().query(`delete from dbo.supp_surveyform_line_dtls where survey_id=$1`,[Number(id)]);
        await getPool().query(`delete from dbo.supp_surveyform_hdr_dtls where id=$1`,[Number(id)])
        return "Success - Form Deleted Sucessfully";
    }
    catch(error)
    {
        console.error(error);
        return "Error - Unable to delete from due to "+error;
    }
}

export async function saveFormQuestions(formId: string, questions: any[],title:string)
{
    if (!Array.isArray(questions)) {
        throw new TypeError("questions must be an array");
    }

    const client = await getPool().connect();
    try 
    {
        await client.query('BEGIN');
        for (const question of questions) 
        {
            let id =0;
            if(!question.id)
            {
            const seq = await getPool().query(`SELECT nextval('dbo.supp_survey_question_seq_id')::int AS id`);
             id = seq.rows[0].id;
             await client.query(`INSERT INTO dbo.supp_surveyform_line_dtls (id,survey_id, text, type, QUES_OPTIONS,WEIGHTAGE,required,BREAK_AFTER) 
                VALUES ($1, $2, $3, $4,$5,$6,$7,$8)`, [id, formId, question.text, question.type, JSON.stringify(question.options),question.weight,question.required,question.break_after]);
            }
            else
            {
              await client.query(`UPDATE dbo.supp_surveyform_line_dtls
                SET text = $2,type = $3,ques_options = $4,weightage = $5
                WHERE id = $1`,
                [
                question.id,
                question.text,
                question.type,
                JSON.stringify(question.options),
                question.weight,
                ]
                );

                try {
    await client.query(
        `UPDATE dbo.supp_survey_resp_line_dtls l
         SET
             ques_text = $2,
             ques_type = $3,
             ques_option = $4,
             weitage = $5
         FROM dbo.supp_survey_resp_hdr_dtls h
         WHERE l.ques_id = $1
           AND l.survey_resp_id = h.id
           AND h.status = 'Draft'
           AND h.survey_id = $6`,
        [
            question.id,
            question.text,
            question.type,
            JSON.stringify(question.options),
            question.weight,
            Number(formId),
        ]
    );
} catch (error) {
    console.error(error);
}
            }
        }
        await client.query("COMMIT");
    }   
    catch (error) 
    {
        await client.query('ROLLBACK');
        throw error;
    }
     finally {
    client.release();
  }

    // await getPool().query(`update dbo.supp_surveyform_hdr_dtls set status='InActive' where id not in ($1)`,[Number(formId)]);
    // await getPool().query(`update dbo.supp_surveyform_hdr_dtls set title=$1,status='Active' where id=$2`,[title,Number(formId)]);
    // await getPool().query(`update dbo.supp_po_header_dtls set attribute_4=$1 where po_status='Complete' and (attribute_2 IS NULL OR attribute_2 <> 'Submitted')`,[formId]);

    if(title?.trim())
    {
        await getPool().query(`update dbo.supp_surveyform_hdr_dtls set title=$1 where id=$2`,[title,Number(formId)]);
    }
}

export async function findFormQuestions(id: string) 
{
    const formId = Number(id);
    const result = await getPool().query(`SELECT * FROM dbo.supp_surveyform_line_dtls WHERE survey_id = $1`, [formId]);
    return result.rows;
}

export async function getAllForms(query: any) 
{
    const { page, limit, offset } = parseListPageLimit(query.page, query.limit);

    const whereConditions: string[] = [];
    const params: any[] = [];

    if (query.status) {
        params.push(query.status);
        whereConditions.push(`status = $${params.length}`);
    }

    if (query.title) {
        params.push(`%${query.title}%`);
        whereConditions.push(`title ILIKE $${params.length}`);
    }

    const whereClause =
        whereConditions.length > 0
            ? `WHERE ${whereConditions.join(" AND ")}`
            : "";

    const countResult = await getPool().query(
        `SELECT COUNT(*) AS total
        FROM dbo.supp_surveyform_hdr_dtls
        ${whereClause}
        `,
        params
    );

    const total = parseInt(countResult.rows[0].total, 10);

    const dataParams = [...params];

    let limitClause = "";
    if (limit !== 0) {
        dataParams.push(limit);
        dataParams.push(offset);
        limitClause = `LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
    }

    const result = await getPool().query(
        `
        SELECT id, type, title, status
        FROM dbo.supp_surveyform_hdr_dtls
        ${whereClause}
        ORDER BY creation_date DESC, id DESC
        ${limitClause}
        `,
        dataParams
    );

    return {
        data: result.rows,
        pagination: listPaginationMeta(total, page, limit)
    };
}

export async function getFormStats(sessionUser: any) {
    try {
        const result = await getPool().query(`
            SELECT
                (SELECT COUNT(*)
                 FROM dbo.supp_surveyform_hdr_dtls) AS total,

                (SELECT COUNT(*)
                 FROM dbo.supp_surveyform_hdr_dtls
                 WHERE status = 'Draft') AS draft_evaluation,

                (SELECT COUNT(*)
                 FROM dbo.supp_po_header_dtls
                 WHERE attribute_4 IS NOT NULL and attribute_4 <> '0'  
                   AND (attribute_2 IS NULL OR attribute_2 <> 'Submitted')
                and po_status='Complete')  AS pending_evaluation,

                (SELECT COUNT(*)
                 FROM dbo.supp_survey_resp_hdr_dtls
                 WHERE status='Submitted'
                ) AS completed_evaluation,

                (SELECT COALESCE(ROUND(AVG(star_rate), 2), 0) 
                  FROM dbo.supp_survey_resp_hdr_dtls
                  WHERE star_rate IS NOT NULL) AS avg_supplier_rating;
        `);

        return result.rows[0];
    } catch (error) {
        console.error("Error fetching form statistics:", error);
        throw error;
    }
}

export async function getAllMappingsOfForm(formId: string) 
{
    const result = await getPool().query(`select * from dbo.supp_survey_map_dtls where survey_id=$1`,[Number(formId)]);
    return result.rows;
}

export async function saveSurveyResponse(formid: string, entityNumber: string, supplier_id: any, formAnswerData: any[],suppName:string,formTitle:string,userName:string,comment:string,assignedTo:string,type:string) 
{
    const client = await getPool().connect();
    try
    {
    const result = await getPool().query(`select * from dbo.supp_survey_resp_hdr_dtls where survey_id=$1 and po_number=$2`,[formid,entityNumber]);
    let respid=0;
    const submissionType = type === "draft" ? "Draft" : "Submitted";
    if(!result.rows[0])
    {
        const seq = await getPool().query(`SELECT nextval('dbo.supp_survey_resp_seq_id')::int AS id`);
        const id = seq.rows[0].id;      
        
        const result = await getPool().query(`insert into dbo.supp_survey_resp_hdr_dtls
            (id,supplier_id,supplier_name,survey_id,po_number,createdby,creation_date,status,attribute_14)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id,supplier_id,suppName,formid,entityNumber,userName,new Date(),"Submitted",assignedTo]);
        respid = id;
    }
    else
    {
        respid=result.rows[0].id;
        const resultData = await getPool().query(
    `UPDATE dbo.supp_survey_resp_hdr_dtls
     SET
         supplier_id = $2,
         supplier_name = $3,
         survey_id = $4,
         po_number = $5,
         createdby = $6,
         creation_date = $7,
         status = $8
     WHERE id = $1`,
    [
        result.rows[0].id,
        supplier_id,
        suppName,
        formid,
        entityNumber,
        userName,
        new Date(),
        submissionType
    ]);
    }

    let finalScore = 0;
    for(const answer of formAnswerData)
    {
        let id =0;
        const questionData = await getPool().query("select * from dbo.supp_surveyform_line_dtls where id=$1",[answer.ques_id])
         const existingAnswer = await getPool().query(`SELECT * FROM dbo.supp_survey_resp_line_dtls WHERE survey_resp_id = $1 AND ques_id=$2`, [respid,answer.ques_id]);
         let score = await caluclateScoreForQuestion(questionData.rows[0].type,answer.answer,questionData.rows[0].weightage,answer.optionWeitage)
         if (existingAnswer.rowCount === 0)
         {
            const seq = await getPool().query(`SELECT nextval('dbo.supp_survey_resp_line_seq_id')::int AS id`);
            id = seq.rows[0].id;

            await client.query(`INSERT INTO dbo.supp_survey_resp_line_dtls 
                (id,ques_answer,ques_id,ques_type,survey_resp_id,ques_option,ques_text,weitage,ques_score) 
            VALUES ($1, $2, $3, $4,$5,$6,$7,$8,$9)`, 
            [id, 
             answer.answer,
             questionData.rows[0].id,
             questionData.rows[0].type,
             Number(respid),
             JSON.stringify(questionData.rows[0].ques_options),
             questionData.rows[0].text,
             questionData.rows[0].weightage,
             score,
            ]);
        }
        else
        {
            await client.query(`UPDATE dbo.supp_survey_resp_line_dtls SET ques_answer = $2,ques_score=$3 WHERE id = $1`,
            [
            existingAnswer.rows[0].id,
            answer.answer,
            score
            ]
            );
        }        
        finalScore= Number(finalScore)+Number(score);
    }
    
    let startRating = Number(finalScore)/20;
    await getPool().query(`update dbo.supp_survey_resp_hdr_dtls set attribute_12=$3,attribute_15=$1,star_rate=$4,status=$5,attribute_1=$5 where id=$2`,[comment,Number(respid),finalScore,startRating,submissionType]);
    
    await getPool().query(`update dbo.supp_po_header_dtls set attribute_15=$1,attribute_2=$2 where po_number=$3`,[comment,submissionType,entityNumber]);
}
catch(error)
{
  console.error(error);
} 
finally
{
    client.release();
}
}

export async function findRespQuestions(id: string) 
{
    const formId = Number(id);
    const result = await getPool().query(`SELECT * FROM dbo.supp_survey_resp_line_dtls WHERE survey_id = $1`, [formId]);
    return result.rows;
}

export async function getActiveFromId() 
{
    const id = await getPool().query(`select id from dbo.supp_surveyform_hdr_dtls where status='Active'`);
    return id.rows[0];
}

export async function deleteQuestion(quesId: string) 
{
    try
    {
        const questionData = await getPool().query("select * from dbo.supp_surveyform_line_dtls where id=$1",[Number(quesId)])
        const data = await getPool().query(`select status from dbo.supp_surveyform_hdr_dtls where id=$1`,[Number(questionData.rows[0].survey_id)])
        const result = data?.rows[0].status;
         if (result === "Active") {
            return "Error - Unable to delete the question from an active form. Please make sure the form is InActive.";
        }
        else{
        await getPool().query(`delete from dbo.supp_surveyform_line_dtls where id=$1`,[Number(quesId)]);
        return "Success - Question deleted successfully";
        }
    }
    catch(error)
    {
        console.log(error);
        return "Error - Unable to delete the question";
    }       
}
export async function getRespAnswer(id: string) 
{
    const result = await getPool().query(`select * from dbo.supp_survey_resp_line_dtls where survey_resp_id=$1`,[Number(id)]);
    return result.rows;
}

export async function caluclateScoreForQuestion(quesType:string,answer:string,weitage:Number,optionWeitage:Number)
{
    if(quesType.includes("Rating 1-5"))
    {
        const ratingScore = Number(weitage)/5;
        return Number(answer)*Number(ratingScore);
    }
    else if(quesType.includes("Yes / No"))
    {
        if (optionWeitage === null || optionWeitage === undefined) 
        {
        return 0;
        }
        const optionScore = Number(weitage)*(Number(optionWeitage)/100);
        return optionScore;
    }
    else if(quesType.includes("Single Choice"))
    {
        if (optionWeitage === null || optionWeitage === undefined) 
        {
            return 0;
        }
        const optionScore = Number(weitage)*(Number(optionWeitage)/100);
        return optionScore;
    }
}

export async function getAllResponses(query:any,id:string) 
{
    const { page, limit, offset } = parseListPageLimit(query.page, query.limit);

    const whereConditions: string[] = [];
    const params: any[] = [];

    if (query.status) {
        params.push(query.status);
        whereConditions.push(`status = $${params.length}`);
    }

    if (query.poNumber) {
        params.push(`%${query.poNumber}%`);
        whereConditions.push(`po_number ILIKE $${params.length}`);
    }

    if (query.supplier) {
        params.push(`%${query.supplier}%`);
        whereConditions.push(`supplier_name ILIKE $${params.length}`);
    }

    if(id)
    {
        params.push(id);
        whereConditions.push(`supplier_id = $${params.length}`);
    }
    let whereClause = whereConditions.length > 0
            ? `where ${whereConditions.join(" AND ")}`
            : "";

    const countResult = await getPool().query(
        `SELECT COUNT(*) AS total
        FROM dbo.supp_survey_resp_hdr_dtls 
        ${whereClause}
        `,
        params
    );

    const total = parseInt(countResult.rows[0].total, 10);

    const dataParams = [...params];

    let limitClause = "";
    if (limit !== 0) {
        dataParams.push(limit);
        dataParams.push(offset);
        limitClause = `LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
    }

    const data = await getPool().query(
            `SELECT *
             FROM dbo.supp_survey_resp_hdr_dtls ${whereClause}
             ORDER BY creation_date DESC
             ${limitClause}`,
            dataParams
        );

    return {
        data: data.rows,
        pagination: listPaginationMeta(total, page, limit)    
    };
}

export async function getStartStats() 
{
    try
    {
        const result = await getPool().query(`
            SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE star_rate = 5) AS "5_Stars",
                COUNT(*) FILTER (WHERE star_rate >=4 and star_rate < 5) AS "4_Stars",
                COUNT(*) FILTER (WHERE star_rate >=3 and star_rate < 4) AS "3_Stars",
                COUNT(*) FILTER (WHERE star_rate >=2 and star_rate < 3) AS "2_Stars",
                COUNT(*) FILTER (WHERE star_rate >=1 and star_rate < 2) AS "1_Stars" 
            FROM dbo.supp_survey_resp_hdr_dtls
        `);

        const supplierResult = await getPool().query(`SELECT supplier_name,ROUND(AVG(star_rate)::NUMERIC, 2) AS star_rate,ROUND(AVG(CAST(attribute_12 AS NUMERIC)), 2) AS max_score,
        COUNT(po_number) AS po_count FROM dbo.supp_survey_resp_hdr_dtls WHERE attribute_12 IS NOT NULL AND attribute_12 <> ''
        GROUP BY supplier_name HAVING COUNT(po_number) > 1 ORDER BY max_score DESC LIMIT 5;`);

        return {
            stars: result.rows,
            suppliers: supplierResult.rows,
        };
    }
    catch(error)
    {
          console.error(error);
        return {
            stars: {},
            suppliers: []
        };
    }
}

export async function getMappedPoNumbers(id: string) 
{
    try
    {
        const data = await getPool().query(`select supplier_name,po_number,creation_date from dbo.supp_survey_resp_hdr_dtls where survey_id=$1`,[Number(id)]);
        return data.rows;
    }
    catch(error)
    {
        console.error(error);
        return {};
    }
}
export async function enableOrDisableFormById(id: string,status:string) 
{
    try
    {
        if(status.includes('Y'))
        {
            const quesData = await getPool().query(`select count(*) from dbo.supp_surveyform_line_dtls where survey_id=$1`,[Number(id)]);
            if(quesData.rows.length === 0 || Number(quesData.rows[0].count) === 0)
            {
                return "Error - Please at least one question to enable the form";
            }
            await getPool().query(`update dbo.supp_surveyform_hdr_dtls set status='Active' where id=$1`,[Number(id)]);
            await getPool().query(`update dbo.supp_surveyform_hdr_dtls set status='InActive' where id not in ($1)`,[Number(id)]);
            await getPool().query(`update dbo.supp_po_header_dtls set attribute_4=$1 where po_status IN ('Approved','Draft') and (attribute_2 IS NULL OR attribute_2 <> 'Submitted')`,[id]);
        }
        else
        {
            await getPool().query(`update dbo.supp_surveyform_hdr_dtls set status='InActive' where id=$1`,[Number(id)]);
            const data = await getActiveFromId();
            if(!data)
            {
                await getPool().query(`update dbo.supp_surveyform_hdr_dtls set status='Active' where id=$1`,[Number(id)]);
                return "Error - Unable to disable the form as there is no other active form available. Please make sure atleast one form is active at any point of time.";
            }
        }
        return "Successfully processed your request";
    }
    catch(error)
    {
        console.error(error);
        return "Error - Unable to process request";
    }    
}
export async function publishFormById(id: string) 
{
    try
    {
        const quesData = await getPool().query(`select count(*) from dbo.supp_surveyform_line_dtls where survey_id=$1`,[Number(id)]);
        if(quesData.rows.length === 0 || quesData.rows[0].count === 0)
        {
            return "Error - Please at least one question to publish form";
        }
        await getPool().query(`update dbo.supp_surveyform_hdr_dtls set status='Active' where id=$1`,[Number(id)]);
        await getPool().query(`update dbo.supp_surveyform_hdr_dtls set status='InActive' where id <> $1`,[Number(id)]);
        await getPool().query(`update dbo.supp_po_header_dtls set attribute_4=$1 where po_status IN ('Approved','Draft') and (attribute_2 IS NULL OR attribute_2 <> 'Submitted')`,[id]);   
        
        return "Successfully form is published to PO's";
    }   
    catch(error)
    {
        console.error(error);
        return "Unable to the publidh the form details";
    } 
}

export async function getScoreAndRatingByForm(attribute_4: any, po_number: any) 
{
    const data = await getPool().query(`SELECT attribute_12,star_rate FROM dbo.supp_survey_resp_hdr_dtls WHERE survey_id=$1 AND po_number=$2`, [Number(attribute_4), po_number]);
    return data.rows;
}

export async function getSupplierRatingStats(suppId: string) 
{
    try
    {
         const result = await getPool().query(`SELECT COALESCE(ROUND(AVG(star_rate), 2), 0) AS avg_supplier_rating,COUNT(*) AS evaluated_pos,MAX(creation_date) AS last_evaluation_date FROM dbo.supp_survey_resp_hdr_dtls WHERE supplier_id = $1 and status='Submitted'`,[Number(suppId)]);
        return result.rows[0];
    }
    catch(error)
    {
        console.error(error);
        return [];
    }
}

export async function getResponseDataByStat(cardType: string,query:any) 
{
    try
    {
    const { page, limit, offset } = parseListPageLimit(query.page, query.limit);
    let dataParams  =[];
    let limitClause = "";
    let type = cardType?.includes("Pending") ? "Draft" : "Submitted";
    if (limit !== 0) 
    {
        dataParams.push(limit);
        dataParams.push(offset);
        limitClause = `LIMIT $1 OFFSET $2`;
    }

    if(cardType?.includes("Pending"))
    {
    const countResult = await getPool().query(`SELECT COUNT(*) AS total 
        FROM dbo.supp_po_header_dtls where attribute_4 IS NOT NULL and (attribute_2 IS NULL OR attribute_2 <> 'Submitted')`);
    
    const total = parseInt(countResult.rows[0].total, 10);

    const data = await getPool().query(`SELECT p.po_number,p.po_owner_name,(SELECT o.company_name FROM dbo.supp_basic_org_dtls o WHERE o.id = p.supplier_id) AS supplier_name,(SELECT f.title FROM dbo.supp_surveyform_hdr_dtls f WHERE f.id = p.attribute_4::integer) AS form_title
    FROM dbo.supp_po_header_dtls p WHERE p.attribute_4 IS NOT NULL AND (p.attribute_2 IS NULL OR p.attribute_2 <> 'Submitted') ORDER BY p.creation_date DESC
    ${limitClause}`,dataParams);
    
    return {
        data: data.rows,
        pagination: listPaginationMeta(total, page, limit)
    };
    }
    else
    {
        const countResult = await getPool().query(`SELECT COUNT(*) AS total 
        FROM dbo.supp_po_header_dtls where attribute_4 IS NOT NULL and attribute_2='Submitted'`);
    
        const total = parseInt(countResult.rows[0].total, 10);

        const data = await getPool().query(`SELECT p.po_number,p.po_owner_name,(SELECT o.company_name FROM dbo.supp_basic_org_dtls o WHERE o.id = p.supplier_id) AS supplier_name,(SELECT f.title FROM dbo.supp_surveyform_hdr_dtls f WHERE f.id = p.attribute_4::integer) AS form_title
        FROM dbo.supp_po_header_dtls p WHERE p.attribute_4 IS NOT NULL AND ATTRIBUTE_2='Submitted' ORDER BY p.creation_date DESC
        ${limitClause}`,dataParams);
        
        return         {
        data: data.rows,
        pagination: listPaginationMeta(total, page, limit)
        };
    }
    }
    catch(error)
    {
        console.error(error);
        return {
            data: [],
            pagination: listPaginationMeta(0, 1, 10)
        };
    }
}

export async function getEvaluationModuleStatus() 
{
   try
   {
     const data = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='Evaluation'`);
     return data.rows[0].prop_value;
   }
   catch(error)
   {
    console.error(error);
    return "Error - unable to get teh status of Evaluation Module";
   } 
}
export async function updateEvaluationStatus(chatBot: string) 
{
    try
    {
        if(chatBot === 'Y')
        {
         await getPool().query(`update dbo.am_property_mst set prop_value='Yes' where prop_code='Evaluation'`);
        }
        else
        {
            await getPool().query(`update dbo.am_property_mst set prop_value='No' where prop_code='Evaluation'`);
        }
        return "Successfully update the Evaluation status";
    }
    catch(error)
    {
        console.error(error);
        return "Error - Unable to update the status of Evaluation";
    }   
}

